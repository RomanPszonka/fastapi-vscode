# Note: namespace_routes has NO __init__.py (namespace package)
from django.urls import path


def list_items(request):
    return [{"id": 1, "name": "Widget"}]


urlpatterns = [
    path('', list_items),
]
