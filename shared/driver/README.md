# Driver

The driver layer provides APIs shared between internal IDE and VSCode. The APIs are typically a thin
wrapper of a nodejs or a library's API, but if it's impractical to implement the API in internal IDE
in such a glanularity, having coarser APIs is allowed. It's OK and preferred to omit unused options
at first as long as the API is extensible to accept more options in the future.

The client should access the driver APIs through the driver instance, rather than accessing
the APIs directly.

Expected workflow on adding new driver functions and using them is as follows:

- In chromiumos (upstream) repo:

  1. Declare functions in the driver interface (`shared/driver/index.ts`).
  2. Implement the driver function (directly in `src/driver/index.ts`, or import from another file under `src/driver`).

  Changes in step 1 (in general, everything in `shared/`) will be synced to `google3/third_party/javascript/chromiumide`.

- In `google3/devtools/cider/extensions/chromeos`:

  3. Implement the driver functions in `driver/index.ts` (or import from another file).

- In chromiumos (upstream) repo:

  4. Use the driver functions from `shared/app/features` by calling `const driver = getDriver();` (and use APIs added in step 2).
