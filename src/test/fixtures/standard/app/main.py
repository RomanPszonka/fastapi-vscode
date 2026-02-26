from django.urls import path, include

from .routes import items, users


def root(request):
    return {"message": "Hello from standard package layout"}


def health(request):
    return {"status": "ok"}


urlpatterns = [
    path('', root),
    path('health/', health),
    path('users/', include(users.urlpatterns)),
    path('items/', include(items.urlpatterns)),
]
