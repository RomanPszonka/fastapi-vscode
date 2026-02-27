# Django extension for Visual Studio Code

A Visual Studio Code extension for Django application development.

## Overview

This extension enhances the Django development experience in Visual Studio Code by providing:

### Path Operation Explorer

The Path Operation Explorer provides a hierarchical tree view of all Django URL patterns in your application. You can expand URL confs to see their associated path operations, and click on any route to jump directly to its definition in the code. You can also jump to URL conf definitions by right-clicking on a URL conf node.

![Path Operation Explorer GIF](media/walkthrough/path-operations.gif)

### Search for routes

Using ctrl+shift+E (cmd+shift+E on Mac), you can open the Command Palette and quickly search for routes by path, method, or name.

![Search Routes GIF](media/walkthrough/search.gif)

### CodeLens for test client calls

CodeLens links appear above HTTP client calls like `client.get('/items')`, letting you jump directly to the matching route definition.

![CodeLens GIF](media/walkthrough/codelens.gif)

## Settings and customization

| Setting | Description | Default |
|---------|-------------|---------|
| `django.entryPoint` | Entrypoint for the root Django URLconf in module:variable notation (e.g., `myproject.urls:urlpatterns`). If not set, the extension searches `pyproject.toml` and common locations. | `""` (auto-detect) |
| `django.codeLens.enabled` | Show CodeLens links above test client calls (e.g., `client.get('/items')`) to navigate to the corresponding route definition. | `true` |

The extension automatically discovers your Django app by scanning for files that contain `urlpatterns`. If auto-detection doesn't work for your project structure, you can specify an entrypoint via `[tool.django]` in `pyproject.toml` or the `django.entryPoint` VS Code setting.

## License

MIT
