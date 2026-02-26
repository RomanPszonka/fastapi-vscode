from django.urls import path, include

from .routes import apps


def root(request):
    return {"message": "Hello"}


urlpatterns = [
    path('', root),
    path('api/apps/', include(apps.urlpatterns)),
]
