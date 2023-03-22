""" Mongo fuzzy search methods """


def format_url_for_search(url: str):
    """Strip http(s) prefix and trailing slash from URL"""
    url = url.lstrip("https://")
    url = url.lstrip("http://")
    url = url.rstrip("/")
    return url


def make_ngrams(word: str, min_size: int = 6):
    """Make ngrams from word

    word: word to split into ngrams
    min_size: minimum size of ngrams
    """
    length = len(word)
    size_range = range(min_size, max(length, min_size) + 1)
    return list(
        set(
            word[i : i + size]
            for size in size_range
            for i in range(0, max(0, length - size) + 1)
        )
    )


def make_combined_ngrams(first_seed: str, name: str):
    """Return space-separated string of ngrams for seed and name"""
    ngrams = make_ngrams(format_url_for_search(first_seed))
    if name:
        name_ngrams = make_ngrams(format_url_for_search(name))
        ngrams.extend(name_ngrams)
    return " ".join(ngrams)
