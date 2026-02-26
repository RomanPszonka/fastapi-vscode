from django.urls import path, include

from .routes.tokens import urlpatterns as tokens_urls


def root(request):
    return {"message": "Hello"}


urlpatterns = [
    path('', root),
    path('tokens/', include(tokens_urls)),
]
