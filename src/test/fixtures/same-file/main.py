from django.urls import path


def get_items(request):
    return {"items": []}


def create_item(request):
    return {"item": "created"}


def root(request):
    return {"message": "Hello from same file layout"}


def health(request):
    return {"status": "ok"}


urlpatterns = [
    path('api/items/', get_items),
    path('api/items/', create_item),
    path('', root),
    path('health/', health),
]
