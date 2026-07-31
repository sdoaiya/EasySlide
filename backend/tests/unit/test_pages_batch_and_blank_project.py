"""Batch Markdown page import and blank project contract tests."""


def test_create_pages_batch_uses_contiguous_order_and_single_response(client):
    project = client.post('/api/projects', json={
        'creation_type': 'blank',
        'idea_prompt': '',
    })
    assert project.status_code == 201
    project_id = project.get_json()['data']['project_id']

    response = client.post(f'/api/projects/{project_id}/pages/batch', json={
        'pages': [
            {'part': 'A', 'outline_content': {'title': 'One', 'points': ['a']}},
            {'part': 'A', 'outline_content': {'title': 'Two', 'points': ['b']}},
        ],
    })
    assert response.status_code == 201
    pages = response.get_json()['data']['pages']
    assert [page['order_index'] for page in pages] == [0, 1]

    response = client.post(f'/api/projects/{project_id}/pages/batch', json={
        'pages': [{'outline_content': {'title': 'Three', 'points': []}}],
    })
    assert response.status_code == 201
    assert response.get_json()['data']['pages'][0]['order_index'] == 2


def test_create_pages_batch_rejects_invalid_payload_without_partial_rows(client):
    project = client.post('/api/projects', json={'creation_type': 'blank'}).get_json()['data']['project_id']
    response = client.post(f'/api/projects/{project}/pages/batch', json={
        'pages': [
            {'outline_content': {'title': 'Valid', 'points': []}},
            {'part': 'invalid'},
        ],
    })
    assert response.status_code == 400
    details = client.get(f'/api/projects/{project}').get_json()['data']
    assert details['pages'] == []
