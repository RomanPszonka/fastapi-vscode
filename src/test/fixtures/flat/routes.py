from django.urls import path


def list_users(request):
    return [{"id": 1, "name": "Alice"}]


def list_items(request):
    return [{"id": 1, "name": "Widget"}]


urlpatterns = [
    path('users/', list_users),
    path('items/', list_items),
]
