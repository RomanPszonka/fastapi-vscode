from django.urls import path


def list_items(request):
    return [{"id": 1, "name": "Widget"}, {"id": 2, "name": "Gadget"}]


def get_item(request, item_id):
    return {"id": item_id, "name": "Widget"}


urlpatterns = [
    path('', list_items),
    path('<int:item_id>/', get_item),
]
