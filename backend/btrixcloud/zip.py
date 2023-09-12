"""
Methods for interacting with zip/WACZ files
"""
import io
import json
import os
import struct
import zipfile
import zlib

from fastapi import HTTPException


# ============================================================================
EOCD_RECORD_SIZE = 22
ZIP64_EOCD_RECORD_SIZE = 56
ZIP64_EOCD_LOCATOR_SIZE = 20

MAX_STANDARD_ZIP_SIZE = 4_294_967_295

CHUNK_SIZE = 1024 * 256


# ============================================================================
def sync_get_log_stream(client, bucket, key, log_zipinfo, cd_start):
    """Return uncompressed byte stream of log file in WACZ"""
    # pylint: disable=too-many-locals
    file_head = sync_fetch(
        client, bucket, key, cd_start + log_zipinfo.header_offset + 26, 4
    )
    name_len = parse_little_endian_to_int(file_head[0:2])
    extra_len = parse_little_endian_to_int(file_head[2:4])

    content = sync_fetch_stream(
        client,
        bucket,
        key,
        cd_start + log_zipinfo.header_offset + 30 + name_len + extra_len,
        log_zipinfo.compress_size,
    )

    if log_zipinfo.compress_type == zipfile.ZIP_DEFLATED:
        uncompressed_content = zlib.decompressobj(-zlib.MAX_WBITS).decompress(content)
    else:
        uncompressed_content = content

    return uncompressed_content


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


def sync_get_zip_file(client, bucket, key):
    """Fetch enough of the WACZ file be able to read the zip filelist"""
    file_size = sync_get_file_size(client, bucket, key)
    eocd_record = sync_fetch(
        client, bucket, key, file_size - EOCD_RECORD_SIZE, EOCD_RECORD_SIZE
    )

    if file_size <= MAX_STANDARD_ZIP_SIZE:
        cd_start, cd_size = get_central_directory_metadata_from_eocd(eocd_record)
        central_directory = sync_fetch(client, bucket, key, cd_start, cd_size)
        with zipfile.ZipFile(io.BytesIO(central_directory + eocd_record)) as zip_file:
            return (cd_start, zip_file)

    zip64_eocd_record = sync_fetch(
        client,
        bucket,
        key,
        file_size
        - (EOCD_RECORD_SIZE + ZIP64_EOCD_LOCATOR_SIZE + ZIP64_EOCD_RECORD_SIZE),
        ZIP64_EOCD_RECORD_SIZE,
    )
    zip64_eocd_locator = sync_fetch(
        client,
        bucket,
        key,
        file_size - (EOCD_RECORD_SIZE + ZIP64_EOCD_LOCATOR_SIZE),
        ZIP64_EOCD_LOCATOR_SIZE,
    )
    cd_start, cd_size = get_central_directory_metadata_from_eocd64(zip64_eocd_record)
    central_directory = sync_fetch(client, bucket, key, cd_start, cd_size)
    with zipfile.ZipFile(
        io.BytesIO(
            central_directory + zip64_eocd_record + zip64_eocd_locator + eocd_record
        )
    ) as zip_file:
        return (cd_start, zip_file)


async def get_file_size(client, bucket, key):
    """Get WACZ file size from HEAD request"""
    head_response = await client.head_object(Bucket=bucket, Key=key)
    return head_response["ContentLength"]


def sync_get_file_size(client, bucket, key):
    """Get WACZ file size from HEAD request"""
    head_response = client.head_object(Bucket=bucket, Key=key)
    return head_response["ContentLength"]


async def fetch(client, bucket, key, start, length):
    """Fetch a byte range from a file in object storage"""
    end = start + length - 1
    response = await client.get_object(
        Bucket=bucket, Key=key, Range=f"bytes={start}-{end}"
    )
    return await response["Body"].read()


def sync_fetch(client, bucket, key, start, length):
    """Fetch a byte range from a file in object storage"""
    end = start + length - 1
    response = client.get_object(Bucket=bucket, Key=key, Range=f"bytes={start}-{end}")
    return response["Body"].read()


def sync_fetch_stream(client, bucket, key, start, length):
    """Fetch a byte range from a file in object storage as a stream"""
    end = start + length - 1
    response = client.get_object(Bucket=bucket, Key=key, Range=f"bytes={start}-{end}")
    return response["Body"].iter_chunks(chunk_size=CHUNK_SIZE)


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
