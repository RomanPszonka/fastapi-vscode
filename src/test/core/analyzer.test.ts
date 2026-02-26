import * as assert from "node:assert"
import { analyzeFile, analyzeTree } from "../../core/analyzer"
import { Parser } from "../../core/parser"
import { nodeFileSystem, wasmBinaries } from "../testUtils"

suite("analyzer", () => {
  let parser: Parser

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

  suite("analyzeTree", () => {
    test("extracts routes from urlpatterns path() calls", () => {
      const code = `
from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_items, name='list-items'),
    path('create/', views.create_item, name='create-item'),
]
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routes.length, 2)
      assert.strictEqual(result.routes[0].method, "GET")
      assert.strictEqual(result.routes[0].path, "/")
      assert.strictEqual(result.routes[1].method, "GET")
      assert.strictEqual(result.routes[1].path, "/create/")
    })

    test("extracts routers from urlpatterns and DRF routers", () => {
      const code = `
from django.urls import path
from rest_framework.routers import DefaultRouter

urlpatterns = [
    path('users/', views.user_list),
]
router = DefaultRouter()
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routers.length, 2)
      assert.strictEqual(result.routers[0].variableName, "urlpatterns")
      assert.strictEqual(result.routers[0].type, "URLConf")
      assert.strictEqual(result.routers[1].variableName, "router")
      assert.strictEqual(result.routers[1].type, "URLConf")
    })

    test("extracts include() calls", () => {
      const code = `
from django.urls import path, include

urlpatterns = [
    path('users/', include('users.urls')),
    path('items/', include('items.urls')),
]
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.includeRouters.length, 2)
      assert.strictEqual(result.includeRouters[0].router, "users.urls")
      assert.strictEqual(result.includeRouters[0].prefix, "/users")
      assert.strictEqual(result.includeRouters[1].router, "items.urls")
      assert.strictEqual(result.includeRouters[1].prefix, "/items")
    })

    test("extracts imports", () => {
      const code = `
from django.urls import path
from .views import users, items
import os
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.imports.length, 3)

      const djangoImport = result.imports.find(
        (i) => i.modulePath === "django.urls",
      )
      assert.ok(djangoImport)
      assert.deepStrictEqual(djangoImport.names, ["path"])

      const routesImport = result.imports.find((i) => i.modulePath === "views")
      assert.ok(routesImport)
      assert.strictEqual(routesImport.isRelative, true)
    })

    test("resolves same-file string variables in route paths", () => {
      const code = `
from django.urls import path

WEBHOOK_PATH = "webhook"

urlpatterns = [
    path(WEBHOOK_PATH, views.some_webhook),
]
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routes.length, 1)
      assert.strictEqual(result.routes[0].path, "/webhook")
    })

    test("resolves variable used in path concatenation", () => {
      const code = `
from django.urls import path

BASE = "api"

urlpatterns = [
    path(BASE + "/users", views.list_users),
]
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routes.length, 1)
      assert.strictEqual(result.routes[0].path, "/api/users")
    })

    test("leaves unresolvable variables wrapped", () => {
      const code = `
from django.urls import path

urlpatterns = [
    path(settings.API_PREFIX, views.handler),
]
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routes.length, 1)
      assert.strictEqual(result.routes[0].path, "/{settings.API_PREFIX}")
    })

    test("resolves variable in router prefix", () => {
      const code = `
PREFIX = "/users"
urlpatterns = [
    path(PREFIX, views.user_list),
]
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      const urlconf = result.routers.find((r) => r.type === "URLConf")
      assert.ok(urlconf)
    })

    test("resolves variable in include prefix", () => {
      const code = `
USERS_PREFIX = "/users"
urlpatterns = [
    path(USERS_PREFIX, include('users.urls')),
]
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.includeRouters.length, 1)
      assert.strictEqual(result.includeRouters[0].prefix, "/users")
    })

    test("does not substitute function-local variables into URL path parameters", () => {
      const code = `
urlpatterns = [
    path('integrations/<str:integration>/authorize', views.initiate_oauth_flow),
    path('integrations/<str:integration>/callback', views.handle_callback),
]
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routes.length, 2)
      assert.strictEqual(
        result.routes[0].path,
        "/integrations/<str:integration>/authorize",
      )
      assert.strictEqual(
        result.routes[1].path,
        "/integrations/<str:integration>/callback",
      )
    })

    test("sets filePath correctly", () => {
      const code = "x = 1"
      const tree = parse(code)
      const result = analyzeTree(tree, "/custom/path.py")

      assert.strictEqual(result.filePath, "/custom/path.py")
    })
  })

  suite("analyzeFile", () => {
    test("analyzes Django url config", async () => {
      const code = `
from django.urls import path, include

urlpatterns = [
    path('api/', include('myapp.urls')),
    path('health/', views.health_check, name='health'),
]
`
      const mockFs = {
        readFile: async () => new TextEncoder().encode(code),
        exists: async () => true,
        joinPath: (...parts: string[]) => parts.join("/"),
        dirname: (p: string) => p.split("/").slice(0, -1).join("/"),
      }
      const result = await analyzeFile("file:///test/urls.py", parser, mockFs)

      assert.ok(result)
      assert.strictEqual(result.filePath, "file:///test/urls.py")

      // Should find Django URLConf
      const urlconf = result.routers.find((r) => r.type === "URLConf")
      assert.ok(urlconf)
      assert.strictEqual(urlconf.variableName, "urlpatterns")

      // Should find include() calls
      assert.ok(result.includeRouters.length > 0)

      // Should find health check route
      const healthRoute = result.routes.find((r) => r.path === "/health/")
      assert.ok(healthRoute)
      assert.strictEqual(healthRoute.method, "GET")
    })

    test("analyzes DRF router config", async () => {
      const code = `
from django.urls import path, include
from rest_framework.routers import DefaultRouter

router = DefaultRouter()

urlpatterns = [
    path('users/', views.user_list, name='user-list'),
    path('users/<int:pk>/', views.user_detail, name='user-detail'),
    path('', include(router.urls)),
]
`
      const mockFs = {
        readFile: async () => new TextEncoder().encode(code),
        exists: async () => true,
        joinPath: (...parts: string[]) => parts.join("/"),
        dirname: (p: string) => p.split("/").slice(0, -1).join("/"),
      }
      const result = await analyzeFile("file:///test/urls.py", parser, mockFs)

      assert.ok(result)

      // Should find URLConf routers
      const urlconf = result.routers.find(
        (r) => r.variableName === "urlpatterns",
      )
      assert.ok(urlconf)

      // Should find routes
      assert.ok(result.routes.length >= 2)

      // All Django routes default to GET
      const methods = result.routes.map((r) => r.method)
      assert.ok(methods.every((m) => m === "GET"))
    })

    test("returns null when parser fails to parse", async () => {
      const nullParser = { parse: () => null } as unknown as Parser
      const mockFs = {
        readFile: async () => new TextEncoder().encode("x = 1"),
        exists: async () => true,
        joinPath: (...parts: string[]) => parts.join("/"),
        dirname: (p: string) => p.split("/").slice(0, -1).join("/"),
      }
      const result = await analyzeFile("file:///test.py", nullParser, mockFs)
      assert.strictEqual(result, null)
    })

    test("returns null for non-existent file", async () => {
      const result = await analyzeFile(
        "file:///nonexistent/file.py",
        parser,
        nodeFileSystem,
      )
      assert.strictEqual(result, null)
    })
  })
})
