# Services

New code for common utilities should be put under `common` rather than
`services`.

Historically we have been distinguishing `common` and `services` so that
`common` doesn't use `vscode` namespace. It was convenient for unit testing, but
now we have rich vscode doubles support and the distinction is less useful.
