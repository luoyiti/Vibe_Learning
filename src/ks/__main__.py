"""Enable `python -m ks ...` as an alias for the `ks` console script."""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
