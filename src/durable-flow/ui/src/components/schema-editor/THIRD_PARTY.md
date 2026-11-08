# Third-party notes

The visual schema editor in this folder follows the structure and behaviour of
[jsonjoy-builder](https://github.com/lovasoa/jsonjoy-builder) 1.0.4 (MIT, license in
`LICENSE-jsonjoy-builder`): a row per field with name, type, required switch and
delete, expandable nested bodies, and an add-field line.

The code here is written fresh for this project, on our shadcn components and our
simplified JSON Schema dialect (see `docs/superpowers/specs/2026-11-08-json-schema-dialect-design.md`).
The package itself is not a dependency, so nothing from it (its Monaco editor,
its CDN loader, its styles) is in the page.
