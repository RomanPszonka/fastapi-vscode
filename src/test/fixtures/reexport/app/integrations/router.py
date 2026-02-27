from django.urls import path, include

from .neon import urlpatterns as neon_urls


def github_integration(request):
    return {"provider": "github", "status": "connected"}


def slack_integration(request):
    return {"provider": "slack", "status": "connected"}


def webhook(request):
    return {"received": True}


# Nested URL include
urlpatterns = [
    path('neon/', include(neon_urls)),
    path('github/', github_integration),
    path('slack/', slack_integration),
    path('webhook/', webhook),
]
