from django.urls import path, include

# Import from namespace package (no __init__.py in namespace_routes)
from .namespace_routes import items, users


def root(request):
    return {"message": "Hello from namespace package layout"}


urlpatterns = [
    path('', root),
    path('users/', include(users.urlpatterns)),
    path('items/', include(items.urlpatterns)),
]
