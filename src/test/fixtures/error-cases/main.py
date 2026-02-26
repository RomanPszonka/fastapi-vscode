from django.urls import path, include

from .other import urlpatterns as other_urls
from .nonexistent import missing_urls


def root(request):
    return {"ok": True}


urlpatterns = [
    path('', root),
    path('other/', include(other_urls)),
    path('missing/', include(missing_urls)),
]
