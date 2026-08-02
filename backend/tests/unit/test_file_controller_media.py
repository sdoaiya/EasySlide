from pathlib import Path


def _export_file(app, project_id: str, filename: str):
    path = Path(app.config['UPLOAD_FOLDER']) / project_id / 'exports' / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'test-export')


def test_media_export_plays_inline_and_can_be_explicitly_downloaded(client, app):
    _export_file(app, 'media-project', 'preview.mp4')

    preview = client.get('/files/media-project/exports/preview.mp4')
    download = client.get('/files/media-project/exports/preview.mp4?download=1')

    assert preview.status_code == 200
    assert preview.headers['Content-Type'].startswith('video/mp4')
    assert preview.headers['Content-Disposition'].startswith('inline;')
    assert download.headers['Content-Disposition'].startswith('attachment;')


def test_non_media_export_remains_an_attachment(client, app):
    _export_file(app, 'document-project', 'slides.pptx')

    response = client.get('/files/document-project/exports/slides.pptx')

    assert response.status_code == 200
    assert response.headers['Content-Disposition'].startswith('attachment;')
