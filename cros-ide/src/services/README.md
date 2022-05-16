The services directory contains common services that can be used from any
feature. Services typically utilizes some VSCode functionalities or
configurations to function, and when some of the configurations change, they
should reflect the change on its own.

The difference between `common` and `services` is that `services` know about
vscode namespace, but `common` doesn't. `services` can use `common`, but
`common` cannot use `services`.
