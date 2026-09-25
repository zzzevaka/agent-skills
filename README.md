# Agent Skills

## Skills

- [durable-flow](docs/durable-flow/README.md) — create, run, and resume
  persistent multi-stage workflows stored in JSON or YAML flow files.

## Development

Run the unit tests with:

```bash
python3 -m unittest discover -s tests -v
```

Install the development dependencies, including Ruff:

```bash
poetry install --with dev
```

Check Python code for style issues and common errors:

```bash
poetry run ruff check .
```

Apply automatic lint fixes and format the code:

```bash
poetry run ruff check --fix .
poetry run ruff format .
```
