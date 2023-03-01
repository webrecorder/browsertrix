"""
Methods for interacting with zip/WACZ files
"""
import io
import json
import struct
import zipfile
import zlib


# ============================================================================
EOCD_RECORD_SIZE = 22
ZIP64_EOCD_RECORD_SIZE = 56
ZIP64_EOCD_LOCATOR_SIZE = 20

MAX_STANDARD_ZIP_SIZE = 4_294_967_295


# ============================================================================
async def stream_parsed_log_file(client, bucket, key, log_zipinfo, cd_start):
    """Stream body of log file as generator"""
    # pylint: disable=too-many-locals
    file_head = await fetch(
        client, bucket, key, cd_start + log_zipinfo.header_offset + 26, 4
    )
    name_len = parse_little_endian_to_int(file_head[0:2])
    extra_len = parse_little_endian_to_int(file_head[2:4])

    body = await fetch(
        client,
        bucket,
        key,
        cd_start + log_zipinfo.header_offset + 30 + name_len + extra_len,
        log_zipinfo.compress_size,
        read=False,
    )

    gzipped = log_zipinfo.compress_type == zipfile.ZIP_DEFLATED
    if gzipped:
        return parsed_body_chunks(gzip_iter_chunks(body))
    return parsed_json_lines(body)


async def get_zip_file(client, bucket, key):
    """Fetch enough of the WACZ file be able to read the zip filelist"""
    file_size = await get_file_size(client, bucket, key)
    eocd_record = await fetch(
        client, bucket, key, file_size - EOCD_RECORD_SIZE, EOCD_RECORD_SIZE
    )

    if file_size <= MAX_STANDARD_ZIP_SIZE:
        cd_start, cd_size = get_central_directory_metadata_from_eocd(eocd_record)
        central_directory = await fetch(client, bucket, key, cd_start, cd_size)
        return (
            cd_start,
            zipfile.ZipFile(io.BytesIO(central_directory + eocd_record)),
        )

    zip64_eocd_record = await fetch(
        client,
        bucket,
        key,
        file_size
        - (EOCD_RECORD_SIZE + ZIP64_EOCD_LOCATOR_SIZE + ZIP64_EOCD_RECORD_SIZE),
        ZIP64_EOCD_RECORD_SIZE,
    )
    zip64_eocd_locator = await fetch(
        client,
        bucket,
        key,
        file_size - (EOCD_RECORD_SIZE + ZIP64_EOCD_LOCATOR_SIZE),
        ZIP64_EOCD_LOCATOR_SIZE,
    )
    cd_start, cd_size = get_central_directory_metadata_from_eocd64(zip64_eocd_record)
    central_directory = await fetch(client, bucket, key, cd_start, cd_size)
    return (
        cd_start,
        zipfile.ZipFile(
            io.BytesIO(
                central_directory + zip64_eocd_record + zip64_eocd_locator + eocd_record
            )
        ),
    )


async def get_file_size(client, bucket, key):
    """Get WACZ file size from HEAD request"""
    head_response = await client.head_object(Bucket=bucket, Key=key)
    return head_response["ContentLength"]


# pylint: disable=too-many-arguments
async def fetch(client, bucket, key, start, length, read=True):
    """Fetch a byte range from a file in object storage"""
    end = start + length - 1
    response = await client.get_object(
        Bucket=bucket, Key=key, Range=f"bytes={start}-{end}"
    )
    if read:
        return await response["Body"].read()
    return response["Body"]


# pylint: disable=inconsistent-return-statements
def parse_json_line(line):
    """Decode and parse json-l line into dict."""
    try:
        line = line.splitlines()[0]
        return json.loads(line)
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
        print(f"Error decoding json-l line: {line}. Error: {err}", flush=True)


async def gzip_iter_chunks(body):
    """Return a generator with decompressed chunks."""
    decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
    async for chunk in body.iter_chunks():
        yield decompressor.decompress(chunk)


async def parsed_body_chunks(chunk_generator):
    """Return an iterator to yield lines from stream as dicts."""
    pending = b""
    async for chunk in chunk_generator:
        lines = (pending + chunk).splitlines(True)
        async for line in lines[:-1]:
            line_json = parse_json_line(line)
            if line_json:
                yield line_json
        pending = lines[-1]
    if pending:
        line_json = parse_json_line(pending)
        if line_json:
            yield line_json


async def parsed_json_lines(body):
    """Return an iterator to yield lines as dicts."""
    async for line in body.iter_lines():
        line = line.decode("utf-8", errors="ignore")
        line_json = parse_json_line(line)
        if line_json:
            yield line_json


def get_central_directory_metadata_from_eocd(eocd):
    """Get central directory start and size"""
    cd_size = parse_little_endian_to_int(eocd[12:16])
    cd_start = parse_little_endian_to_int(eocd[16:20])
    return cd_start, cd_size


def get_central_directory_metadata_from_eocd64(eocd64):
    """Get central directory start and size for zip64"""
    cd_size = parse_little_endian_to_int(eocd64[40:48])
    cd_start = parse_little_endian_to_int(eocd64[48:56])
    return cd_start, cd_size


def parse_little_endian_to_int(little_endian_bytes):
    """Convert little endian used in zip spec to int"""
    byte_length = len(little_endian_bytes)
    format_character = "q"
    if byte_length == 4:
        format_character = "i"
    elif byte_length == 2:
        format_character = "h"

    return struct.unpack("<" + format_character, little_endian_bytes)[0]
