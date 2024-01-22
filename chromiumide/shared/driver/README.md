# Driver

The driver layer provides APIs shared between internal IDE and VSCode. The APIs are typically a thin
wrapper of a nodejs or a library's API, but if it's impractical to implement the API in internal IDE
in such a glanularity, having coarser APIs is allowed. It's OK and preferred to omit unused options
at first as long as the API is extensible to accept more options in the future.

The client should access the driver APIs by importing the 'driver' module, rather than accessing
the APIs directly. (TODO(oka): Add linter check)

```
import * as driver from 'path/to/driver';

driver.node.crypto.randomUUID()
```
