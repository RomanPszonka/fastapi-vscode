/**
 * Utility functions to extract Django-related information from AST nodes.
 */

import type { Node } from "web-tree-sitter"
import type {
  ImportedName,
  ImportInfo,
  IncludeRouterInfo,
  MountInfo,
  RouteInfo,
  RouterInfo,
  RouterType,
} from "./internal"

/** Recursively finds all nodes of a given type within a subtree */
export function findNodesByType(node: Node, type: string): Node[] {
  const results: Node[] = []
  collectNodesByType(node, type, results)
  return results
}

export function stripDocstring(raw: string): string {
  let content: string
  if (
    (raw.startsWith('"""') && raw.endsWith('"""')) ||
    (raw.startsWith("'''") && raw.endsWith("'''"))
  ) {
    content = raw.slice(3, -3)
  } else {
    content = raw.slice(1, -1)
  }

  // Dedent: strip common leading whitespace (like Python's textwrap.dedent)
  const lines = content.split("\n")
  // First line is either empty or unindented (follows opening quotes), so skip it
  const indentedLines = lines.slice(1).filter((l) => l.trim().length > 0)
  if (indentedLines.length === 0) {
    return content.trim()
  }

  // Find minimum indentation of all non-empty lines (except first) so we can
  // remove it from all lines, preserving relative indentation
  const minIndent = Math.min(
    ...indentedLines.map((l) => l.length - l.trimStart().length),
  )
  const dedented = lines.map((l, i) => (i === 0 ? l : l.slice(minIndent)))
  return dedented.join("\n").trim()
}

function collectNodesByType(node: Node, type: string, results: Node[]): void {
  if (node.type === type) {
    results.push(node)
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      collectNodesByType(child, type, results)
    }
  }
}

/**
 * Collects string variable assignments from the AST for path resolution.
 * Handles simple assignments like `WEBHOOK_PATH = "/webhook"`.
 *
 * Examples:
 *   WEBHOOK_PATH = "/webhook"  -> Map { "WEBHOOK_PATH" => "/webhook" }
 *   BASE = "/api"              -> Map { "BASE" => "/api" }
 *   settings.PREFIX = "/api"   -> (skipped, not a simple identifier)
 */
export function collectStringVariables(rootNode: Node): Map<string, string> {
  const variables = new Map<string, string>()
  const assignmentNodes = findNodesByType(rootNode, "assignment")

  for (const assign of assignmentNodes) {
    const left = assign.childForFieldName("left")
    const right = assign.childForFieldName("right")
    if (
      left &&
      right &&
      left.type === "identifier" &&
      right.type === "string"
    ) {
      const varName = left.text
      const value = extractStringValue(right)
      if (value !== null) {
        variables.set(varName, value)
      }
    }
  }

  return variables
}

/**
 * Extracts the string value from a string AST node, handling quotes and f-string prefix.
 * Returns null if the node is not a string.
 *
 * Examples:
 *   '"/users"' -> "/users"
 *   "'/users'" -> "/users"
 *   'f"/users/{id}"' -> "/users/{id}"
 */
export function extractStringValue(node: Node): string | null {
  if (node.type !== "string") {
    return null
  }
  const text = node.text
  // Handle f-string prefix: f"..." or f'...'
  if (text.startsWith('f"') || text.startsWith("f'")) {
    return text.slice(2, -1)
  }
  // Regular string: "..." or '...'
  return text.slice(1, -1)
}

/**
 * Extracts a path string from various AST node types.
 * Handles: plain strings, f-strings, concatenation, identifiers.
 */
export function extractPathFromNode(node: Node): string {
  switch (node.type) {
    case "string":
      return extractStringValue(node) ?? ""

    case "concatenated_string":
      // Adjacent strings: "/api" "/v1" -> "/api/v1"
      return node.namedChildren
        .map((child) => extractPathFromNode(child))
        .join("")

    case "binary_operator": {
      // Concatenation: BASE + "/users"
      const left = node.childForFieldName("left")
      const right = node.childForFieldName("right")
      const operator = node.childForFieldName("operator")
      if (operator?.text === "+" && left && right) {
        return extractPathFromNode(left) + extractPathFromNode(right)
      }
      // For other operators, just return the raw text
      return `\uE000${node.text}\uE000`
    }
    default:
      // Dynamic values: variable, attribute access, or function call.
      // Use \uE000 (Unicode private use) as sentinel so resolveVariables can
      // distinguish these from FastAPI path parameters like {id}.
      return `\uE000${node.text}\uE000`
  }
}

/**
 * Django uses urlpatterns for routing, not decorators.
 * DRF @api_view decorators are not used for route definition.
 * Kept for backward compatibility with the analyzer pipeline.
 */
export function decoratorExtractor(_node: Node): RouteInfo | null {
  return null
}

/** Ensures a Django path starts with / for consistency */
function ensureLeadingSlash(path: string): string {
  if (path && !path.startsWith("/")) {
    return `/${path}`
  }
  return path
}

/** Extracts tags from a list node like ["users", "admin"] */
export function extractTags(listNode: Node): string[] {
  return listNode.namedChildren
    .map((elem) => extractStringValue(elem))
    .filter((v): v is string => v !== null)
}

export function routerExtractor(node: Node): RouterInfo | null {
  if (node.type !== "assignment") {
    return null
  }

  const variableNameNode = node.childForFieldName("left")
  const valueNode = node.childForFieldName("right")
  if (!variableNameNode) {
    return null
  }

  // Detect urlpatterns = [...] assignments
  if (variableNameNode.text === "urlpatterns" && valueNode?.type === "list") {
    return {
      variableName: "urlpatterns",
      type: "URLConf" as RouterType,
      prefix: "",
      tags: [],
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
    }
  }

  // Detect DRF Router assignments: router = DefaultRouter() or router = SimpleRouter()
  if (valueNode?.type !== "call") {
    return null
  }

  const funcName = valueNode.childForFieldName("function")?.text
  if (
    funcName === "DefaultRouter" ||
    funcName === "SimpleRouter" ||
    funcName === "rest_framework.routers.DefaultRouter" ||
    funcName === "rest_framework.routers.SimpleRouter"
  ) {
    return {
      variableName: variableNameNode.text,
      type: "URLConf" as RouterType,
      prefix: "",
      tags: [],
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
    }
  }

  return null
}

/** Checks if a node is inside an ancestor of a given type */
function hasAncestor(node: Node, ancestorType: string): boolean {
  let parent = node.parent
  while (parent) {
    if (parent.type === ancestorType) {
      return true
    }
    parent = parent.parent
  }
  return false
}

/** Parses a module path, extracting relative dots if present */
function parseModulePath(rawPath: string): {
  modulePath: string
  isRelative: boolean
  relativeDots: number
} {
  const matches = rawPath.match(/^(\.+)(.*)/)
  if (matches) {
    return {
      modulePath: matches[2],
      isRelative: true,
      relativeDots: matches[1].length,
    }
  }
  return { modulePath: rawPath, isRelative: false, relativeDots: 0 }
}

export function importExtractor(node: Node): ImportInfo | null {
  if (
    node.type !== "import_statement" &&
    node.type !== "import_from_statement"
  ) {
    return null
  }

  const names: string[] = []
  const namedImports: ImportedName[] = []

  if (node.type === "import_statement") {
    const nameNodes = findNodesByType(node, "dotted_name")
    for (const nameNode of nameNodes) {
      const firstName = nameNode.text.split(".")[0]
      names.push(firstName)
      namedImports.push({ name: firstName, alias: null })
    }
    const modulePath = nameNodes[0]?.text ?? ""
    return {
      modulePath,
      names,
      namedImports,
      isRelative: false,
      relativeDots: 0,
    }
  }

  // import_from_statement
  const moduleNode = node.childForFieldName("module_name")
  const { modulePath, isRelative, relativeDots } = parseModulePath(
    moduleNode?.text ?? "",
  )

  // Aliased imports (e.g., "router as users_router")
  for (const aliased of findNodesByType(node, "aliased_import")) {
    const nameNode = aliased.childForFieldName("name")
    const aliasNode = aliased.childForFieldName("alias")
    if (nameNode) {
      const alias = aliasNode?.text ?? null
      names.push(alias ?? nameNode.text)
      namedImports.push({ name: nameNode.text, alias })
    }
  }

  // Non-aliased imports (skip first dotted_name which is the module path)
  const nameNodes = findNodesByType(node, "dotted_name")
  for (let i = 1; i < nameNodes.length; i++) {
    const nameNode = nameNodes[i]
    if (!hasAncestor(nameNode, "aliased_import")) {
      names.push(nameNode.text)
      namedImports.push({ name: nameNode.text, alias: null })
    }
  }

  return { modulePath, names, namedImports, isRelative, relativeDots }
}

/** Extracts method call info: object.method(args) */
function extractMethodCall(
  node: Node,
  methodName: string,
): { object: string; args: Node[] } | null {
  if (node.type !== "call") {
    return null
  }

  const functionNode = node.childForFieldName("function")
  if (functionNode?.type !== "attribute") {
    return null
  }

  const objectNode = functionNode.childForFieldName("object")
  const methodNode = functionNode.childForFieldName("attribute")
  if (!objectNode || methodNode?.text !== methodName) {
    return null
  }

  const argumentsNode = node.childForFieldName("arguments")
  const args =
    argumentsNode?.namedChildren.filter((c) => c.type !== "comment") ?? []

  return { object: objectNode.text, args }
}

/** Extracts include() calls within path()/re_path() for Django URL includes */
export function includeExtractor(node: Node): IncludeRouterInfo | null {
  if (node.type !== "call") {
    return null
  }

  const funcNode = node.childForFieldName("function")
  const funcName = funcNode?.text
  if (funcName !== "path" && funcName !== "re_path") {
    return null
  }

  const argumentsNode = node.childForFieldName("arguments")
  const args =
    argumentsNode?.namedChildren.filter((c) => c.type !== "comment") ?? []
  if (args.length < 2) {
    return null
  }

  const routeArg = args[0]
  const viewArg = args[1]

  // Check if second argument is include()
  if (viewArg.type !== "call") {
    return null
  }
  const viewFuncName = viewArg.childForFieldName("function")?.text
  if (viewFuncName !== "include") {
    return null
  }

  let prefix = ensureLeadingSlash(extractPathFromNode(routeArg))
  // Remove trailing slash for prefix consistency
  if (prefix.endsWith("/") && prefix.length > 1) {
    prefix = prefix.slice(0, -1)
  }

  // Extract what's being included
  const includeArgs =
    viewArg
      .childForFieldName("arguments")
      ?.namedChildren.filter((c) => c.type !== "comment") ?? []
  let router = ""
  if (includeArgs.length > 0) {
    const firstArg = includeArgs[0]
    if (firstArg.type === "string") {
      router = extractStringValue(firstArg) ?? firstArg.text
    } else if (firstArg.type === "tuple") {
      // include(('myapp.urls', 'myapp'), namespace='v2')
      const tupleItems = firstArg.namedChildren
      if (tupleItems.length > 0 && tupleItems[0].type === "string") {
        router = extractStringValue(tupleItems[0]) ?? tupleItems[0].text
      }
    } else {
      // Could be router.urls or a variable
      router = firstArg.text
    }
  }

  return {
    owner: "urlpatterns",
    router,
    prefix,
    tags: [],
  }
}

/** Extracts route information from path() and re_path() calls in urlpatterns */
export function urlPatternRouteExtractor(node: Node): RouteInfo | null {
  if (node.type !== "call") {
    return null
  }

  const funcNode = node.childForFieldName("function")
  const funcName = funcNode?.text
  if (funcName !== "path" && funcName !== "re_path") {
    return null
  }

  const argumentsNode = node.childForFieldName("arguments")
  const args =
    argumentsNode?.namedChildren.filter((c) => c.type !== "comment") ?? []
  if (args.length < 2) {
    return null
  }

  const routeArg = args[0]
  const viewArg = args[1]

  // Skip if second argument is include() - that's handled by includeExtractor
  if (viewArg.type === "call") {
    const viewFuncName = viewArg.childForFieldName("function")?.text
    if (viewFuncName === "include") {
      return null
    }
  }

  const routePath = ensureLeadingSlash(extractPathFromNode(routeArg))

  // Extract the view function name
  let functionName = viewArg.text
  // Handle cases like views.user_list -> user_list
  if (viewArg.type === "attribute") {
    functionName = viewArg.childForFieldName("attribute")?.text ?? viewArg.text
  }

  return {
    owner: "urlpatterns",
    method: "GET", // Django URLs don't specify method; default to GET
    path: routePath,
    function: functionName,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  }
}

/** Extracts mount() calls for subapps: app.mount("/path", subapp) */
export function mountExtractor(node: Node): MountInfo | null {
  const call = extractMethodCall(node, "mount")
  if (!call || call.args.length < 2) {
    return null
  }

  return {
    owner: call.object,
    path: extractPathFromNode(call.args[0]),
    app: call.args[1].text,
  }
}
