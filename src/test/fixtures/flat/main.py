from django.urls import path, include

from routes import urlpatterns as route_urls


def root(request):
    return {"message": "Hello from flat layout"}


urlpatterns = [
    path('', root),
    path('api/', include('routes')),
]
