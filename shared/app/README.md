# App

The app layer is where the ChromiumIDE/ cider ChromeOS extension's features implementation lives in.
The app layer cannot depend on nodejs modules directly, and must instead depend
on modules in the `driver` layer.
