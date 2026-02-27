/**
 * VSCode extension entry point for Django URL pattern discovery.
 */

import * as vscode from "vscode"
import { discoverDjangoApps } from "./appDiscovery"
import { clearImportCache } from "./core/importResolver"
import { Parser } from "./core/parser"
import { stripLeadingDynamicSegments } from "./core/pathUtils"
import { collectRoutes } from "./core/treeUtils"
import type { AppDefinition, SourceLocation } from "./core/types"
import { disposeLogger, log } from "./utils/logger"
import {
  getMethodSvgIcon,
  type PathOperationTreeItem,
  PathOperationTreeProvider,
} from "./vscode/pathOperationTreeProvider"
import { TestCodeLensProvider } from "./vscode/testCodeLensProvider"

export const EXTENSION_ID = "DjangoLabs.django-vscode"

export function getExtensionVersion(): string {
  return (
    vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.version ??
    "unknown"
  )
}

let parserService: Parser | null = null

function navigateToLocation(location: SourceLocation): void {
  const uri = vscode.Uri.parse(location.filePath)
  const position = new vscode.Position(location.line - 1, location.column)
  vscode.window.showTextDocument(uri, {
    selection: new vscode.Range(position, position),
  })
}

export async function activate(context: vscode.ExtensionContext) {
  const extensionVersion = getExtensionVersion()
  log(
    `Django extension ${extensionVersion} activated (VS Code ${vscode.version})`,
  )

  let apps: Awaited<ReturnType<typeof discoverDjangoApps>> = []

  try {
    parserService = new Parser()

    // Read Wasm files via VS Code's virtual filesystem API
    const [coreWasm, pythonWasm] = await Promise.all([
      vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(
          context.extensionUri,
          "dist",
          "wasm",
          "web-tree-sitter.wasm",
        ),
      ),
      vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(
          context.extensionUri,
          "dist",
          "wasm",
          "tree-sitter-python.wasm",
        ),
      ),
    ])

    await parserService.init({
      core: coreWasm,
      python: pythonWasm,
    })
  } catch (error) {
    throw error
  }

  // Discover apps and create providers
  apps = await discoverDjangoApps(parserService)

  // Create grouping function that groups by workspace folder if there are multiple folders
  const groupApps = (apps: AppDefinition[]) => {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length <= 1) {
      // Single workspace folder: show apps directly at root
      return apps.map((app) => ({ type: "app" as const, app }))
    }

    // Multi-root workspace: group by workspace folder
    const grouped = apps.reduce((acc, app) => {
      const existing = acc.get(app.workspaceFolder) ?? []
      acc.set(app.workspaceFolder, [...existing, app])
      return acc
    }, new Map<string, AppDefinition[]>())

    // Create workspace items with folder names
    return Array.from(grouped.entries()).map(([folderPath, apps]) => {
      const folder = workspaceFolders.find((f) => f.uri.fsPath === folderPath)
      const label = folder?.name ?? folderPath.split("/").pop() ?? folderPath
      return { type: "workspace" as const, label, apps }
    })
  }

  const pathOperationProvider = new PathOperationTreeProvider(
    context.extensionUri,
    apps,
    groupApps(apps),
  )
  const codeLensProvider = new TestCodeLensProvider(parserService, apps)

  // File watcher for auto-refresh
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null
  const triggerRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout)
    refreshTimeout = setTimeout(async () => {
      if (!parserService) return
      const newApps = await discoverDjangoApps(parserService)
      pathOperationProvider.setApps(newApps, groupApps(newApps))
      codeLensProvider.setApps(newApps)
    }, 300)
  }

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.py")
  watcher.onDidChange(triggerRefresh)
  watcher.onDidCreate(triggerRefresh)
  watcher.onDidDelete(triggerRefresh)

  // Re-discover when workspace folders change (handles late folder availability in browser)
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(triggerRefresh),
  )

  // Tree view
  const treeView = vscode.window.createTreeView("path-operation-explorer", {
    treeDataProvider: pathOperationProvider,
  })

  // CodeLens provider (optional)
  const config = vscode.workspace.getConfiguration("django")
  if (config.get<boolean>("codeLens.enabled", true)) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { language: "python", pattern: "**/*test*.py" },
        codeLensProvider,
      ),
    )
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      const requiresReload =
        e.affectsConfiguration("django.codeLens.enabled") ||
        e.affectsConfiguration("django.entryPoint")

      if (requiresReload) {
        const action = await vscode.window.showWarningMessage(
          "Django setting changed. Reload the window to apply changes.",
          "Reload Window",
        )
        if (action === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow")
        }
      }
    }),
  )

  // Register disposables and commands
  context.subscriptions.push(
    watcher,
    treeView,
    registerCommands(
      context.extensionUri,
      pathOperationProvider,
      codeLensProvider,
      groupApps,
    ),
  )
}

function registerCommands(
  extensionUri: vscode.Uri,
  pathOperationProvider: PathOperationTreeProvider,
  codeLensProvider: TestCodeLensProvider,
  groupApps: (
    apps: AppDefinition[],
  ) => Array<
    | { type: "app"; app: AppDefinition }
    | { type: "workspace"; label: string; apps: AppDefinition[] }
  >,
): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.commands.registerCommand(
      "django-vscode.refreshPathOperations",
      async () => {
        if (!parserService) return
        clearImportCache()
        const newApps = await discoverDjangoApps(parserService)
        pathOperationProvider.setApps(newApps, groupApps(newApps))
        codeLensProvider.setApps(newApps)
      },
    ),

    vscode.commands.registerCommand(
      "django-vscode.goToPathOperation",
      (item: PathOperationTreeItem) => {
        if (item.type === "route") {
          navigateToLocation(item.route.location)
        }
      },
    ),

    vscode.commands.registerCommand(
      "django-vscode.searchPathOperations",
      async () => {
        const workspacePrefix =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ""
        const items = collectRoutes(pathOperationProvider.getApps())
          .map((route) => {
            const path = stripLeadingDynamicSegments(route.path)
            return {
              label: `${route.method.toUpperCase()} ${path}`,
              iconPath: getMethodSvgIcon(extensionUri, route.method),
              description: route.functionName,
              detail: vscode.Uri.parse(route.location.filePath)
                .fsPath.replace(workspacePrefix, "")
                .replace(/^\//, ""),
              route,
              sortKey: `${path} ${route.method}`,
            }
          })
          .sort((a, b) => a.sortKey.localeCompare(b.sortKey))

        if (items.length === 0) {
          vscode.window.showInformationMessage(
            "No Django URL patterns found in the workspace.",
          )
          return
        }

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "Search Django URL patterns...",
          matchOnDescription: true,
        })
        if (selected) {
          navigateToLocation(selected.route.location)
        }
      },
    ),

    vscode.commands.registerCommand(
      "django-vscode.copyPathOperationPath",
      (item: PathOperationTreeItem) => {
        if (item.type === "route") {
          vscode.env.clipboard.writeText(
            stripLeadingDynamicSegments(item.route.path),
          )
        }
      },
    ),

    vscode.commands.registerCommand(
      "django-vscode.goToRouter",
      (item: PathOperationTreeItem) => {
        if (item.type === "router") {
          navigateToLocation(item.router.location)
        }
      },
    ),

    vscode.commands.registerCommand("django-vscode.reportIssue", () => {
      vscode.env.openExternal(
        vscode.Uri.parse(
          "https://github.com/django/django-vscode/issues/new?labels=bug",
        ),
      )
    }),

    vscode.commands.registerCommand("django-vscode.toggleRouters", () => {
      pathOperationProvider.toggleRouters()
    }),

    vscode.commands.registerCommand(
      "django-vscode.goToDefinition",
      (
        locations: vscode.Location[],
        fromUri: vscode.Uri,
        fromPosition: vscode.Position,
      ) => {
        vscode.commands.executeCommand(
          "editor.action.goToLocations",
          fromUri,
          fromPosition,
          locations,
          locations.length === 1 ? "goto" : "peek",
          "No matching route found",
        )
      },
    ),
  )
}

export async function deactivate() {
  log("Extension deactivated")
  parserService?.dispose()
  parserService = null
  clearImportCache()
  disposeLogger()
}
