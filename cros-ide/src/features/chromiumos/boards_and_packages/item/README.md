# Item

Contains the Item interface and its implementations. Each item corresponds to a
tree item shown on the boards and packages view.

Items form the following hierarchy. The value in parens indicates the context value assignable to the viewItem.

- root
  - board ('board' | 'board-host' | 'board-default')
    - package category
      - package name ('package' | 'package-started' | 'package-stopped')
