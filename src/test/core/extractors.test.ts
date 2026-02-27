import * as assert from "node:assert"
import {
  decoratorExtractor,
  extractPathFromNode,
  extractStringValue,
  findNodesByType,
  importExtractor,
  includeExtractor,
  mountExtractor,
  routerExtractor,
  urlPatternRouteExtractor,
} from "../../core/extractors"
import { Parser } from "../../core/parser"
import { wasmBinaries } from "../testUtils"

suite("Extractors", () => {
  let parser: Parser

  // Helper to parse code and assert tree is not null
  const parse = (code: string) => {
    const tree = parser.parse(code)
    assert.ok(tree, "Failed to parse code")
    return tree
  }

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(wasmBinaries)
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("decoratorExtractor", () => {
    test("returns null for Django - routes come from urlpatterns", () => {
      const code = `
@api_view(['GET'])
def list_users(request):
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      assert.strictEqual(decoratedDefs.length, 1)

      const result = decoratorExtractor(decoratedDefs[0])
      assert.strictEqual(result, null)
    })

    test("returns null for decorated functions since Django does not use decorators for routing", () => {
      const code = `
@router.get("/users")
def list_users():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])
      assert.strictEqual(result, null)
    })

    test("returns null for non-decorated definition", () => {
      const code = `
def regular_function():
    pass
`
      const tree = parse(code)
      const funcDefs = findNodesByType(tree.rootNode, "function_definition")
      const result = decoratorExtractor(funcDefs[0])

      assert.strictEqual(result, null)
    })
  })

  suite("routerExtractor", () => {
    test("extracts urlpatterns list assignment", () => {
      const code = `urlpatterns = [
    path('users/', views.user_list),
]`
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "urlpatterns")
      assert.strictEqual(result.type, "URLConf")
      assert.strictEqual(result.prefix, "")
    })

    test("extracts DRF DefaultRouter instantiation", () => {
      const code = "router = DefaultRouter()"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "router")
      assert.strictEqual(result.type, "URLConf")
    })

    test("extracts DRF SimpleRouter instantiation", () => {
      const code = "router = SimpleRouter()"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "router")
      assert.strictEqual(result.type, "URLConf")
    })

    test("extracts qualified rest_framework.routers.DefaultRouter() call", () => {
      const code = "router = rest_framework.routers.DefaultRouter()"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "router")
      assert.strictEqual(result.type, "URLConf")
    })

    test("extracts empty urlpatterns", () => {
      const code = "urlpatterns = []"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "urlpatterns")
      assert.strictEqual(result.type, "URLConf")
    })

    test("returns null for non-router assignment", () => {
      const code = "x = 5"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.strictEqual(result, null)
    })

    test("returns null for other function call", () => {
      const code = "result = some_function()"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.strictEqual(result, null)
    })

    test("returns null for non-urlpatterns list", () => {
      const code = "other_list = [1, 2, 3]"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.strictEqual(result, null)
    })
  })

  suite("importExtractor", () => {
    test("extracts simple import", () => {
      const code = "import django"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "django")
      assert.deepStrictEqual(result.names, ["django"])
      assert.strictEqual(result.isRelative, false)
    })

    test("extracts from import", () => {
      const code = "from django.urls import path"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "django.urls")
      assert.deepStrictEqual(result.names, ["path"])
      assert.strictEqual(result.isRelative, false)
    })

    test("extracts relative import with single dot", () => {
      const code = "from .routes import users"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "routes")
      assert.strictEqual(result.isRelative, true)
      assert.strictEqual(result.relativeDots, 1)
    })

    test("extracts relative import with double dot", () => {
      const code = "from ..api import router"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "api")
      assert.strictEqual(result.isRelative, true)
      assert.strictEqual(result.relativeDots, 2)
    })

    test("extracts import with alias", () => {
      const code = "from .users import router as users_router"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.deepStrictEqual(result.names, ["users_router"])
      assert.deepStrictEqual(result.namedImports, [
        { name: "router", alias: "users_router" },
      ])
    })

    test("extracts multiple imports", () => {
      const code = "from django.urls import path, include"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.ok(result.names.includes("path"))
      assert.ok(result.names.includes("include"))
    })

    test("returns null for non-import node", () => {
      const code = "x = 5"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = importExtractor(assignments[0])

      assert.strictEqual(result, null)
    })
  })

  suite("includeExtractor", () => {
    test("extracts path() with include() call", () => {
      const code = `path('api/', include('myapp.urls'))`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.owner, "urlpatterns")
      assert.strictEqual(result.router, "myapp.urls")
      assert.strictEqual(result.prefix, "/api")
    })

    test("extracts include with tuple argument", () => {
      const code = `path('api/', include(('myapp.urls', 'myapp'), namespace='v2'))`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.router, "myapp.urls")
      assert.strictEqual(result.prefix, "/api")
    })

    test("extracts include with router.urls", () => {
      const code = `path('', include(router.urls))`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.router, "router.urls")
      assert.strictEqual(result.prefix, "/")
    })

    test("extracts re_path with include", () => {
      const code = `re_path(r'^api/', include('myapp.urls'))`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.router, "myapp.urls")
    })

    test("returns null for path() without include()", () => {
      const code = `path('users/', views.user_list)`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeExtractor(calls[0])

      assert.strictEqual(result, null)
    })

    test("returns null for non-path call", () => {
      const code = "some_function(arg)"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeExtractor(calls[0])

      assert.strictEqual(result, null)
    })
  })

  suite("mountExtractor", () => {
    test("extracts mount call", () => {
      const code = `app.mount("/static", static_app)`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = mountExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.owner, "app")
      assert.strictEqual(result.path, "/static")
      assert.strictEqual(result.app, "static_app")
    })

    test("extracts mount with dynamic path", () => {
      const code = "app.mount(settings.STATIC_PATH, static_app)"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = mountExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.path, "\uE000settings.STATIC_PATH\uE000")
    })

    test("returns null for non-mount call", () => {
      const code = "app.some_method(arg1, arg2)"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = mountExtractor(calls[0])

      assert.strictEqual(result, null)
    })

    test("returns null for mount with missing arguments", () => {
      const code = `app.mount("/static")`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = mountExtractor(calls[0])

      assert.strictEqual(result, null)
    })
  })

  suite("extractStringValue", () => {
    test("returns null for non-string node", () => {
      const code = "x = 42"
      const tree = parse(code)
      const nodes = findNodesByType(tree.rootNode, "integer")
      assert.strictEqual(extractStringValue(nodes[0]), null)
    })
  })

  suite("extractPathFromNode", () => {
    test("returns dynamic placeholder for non-plus binary operator", () => {
      const code = "x = a - b"
      const tree = parse(code)
      const ops = findNodesByType(tree.rootNode, "binary_operator")
      const result = extractPathFromNode(ops[0])
      assert.strictEqual(result, "\uE000a - b\uE000")
    })
  })

  suite("urlPatternRouteExtractor", () => {
    test("extracts simple path() route", () => {
      const code = `path('users/', views.user_list)`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = urlPatternRouteExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.owner, "urlpatterns")
      assert.strictEqual(result.method, "GET")
      assert.strictEqual(result.path, "/users/")
      assert.strictEqual(result.function, "user_list")
    })

    test("extracts path() with attribute view", () => {
      const code = `path('users/', views.user_list, name='user-list')`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = urlPatternRouteExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.function, "user_list")
    })

    test("extracts re_path() route", () => {
      const code = `re_path(r'^articles/(?P<year>[0-9]{4})/$', views.year_archive)`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = urlPatternRouteExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.function, "year_archive")
    })

    test("returns null for path() with include()", () => {
      const code = `path('api/', include('myapp.urls'))`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = urlPatternRouteExtractor(calls[0])

      assert.strictEqual(result, null)
    })

    test("returns null for non-path/re_path call", () => {
      const code = "some_function('arg')"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = urlPatternRouteExtractor(calls[0])

      assert.strictEqual(result, null)
    })

    test("adds leading slash for consistency", () => {
      const code = `path('users/<int:pk>/', views.user_detail)`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = urlPatternRouteExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.path, "/users/<int:pk>/")
    })

    test("handles empty path", () => {
      const code = `path('', views.index)`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = urlPatternRouteExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.path, "/")
    })

    test("includes line and column information", () => {
      const code = `path('users/', views.user_list)`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = urlPatternRouteExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.line, 1)
      assert.strictEqual(result.column, 0)
    })
  })
})
