from django.urls import path, include

# Import urlpatterns that are re-exported from __init__.py
from .integrations import urlpatterns as integration_urls


def root(request):
    return {"message": "Hello from re-export layout"}


urlpatterns = [
    path('', root),
    path('integrations/', include(integration_urls)),
]
