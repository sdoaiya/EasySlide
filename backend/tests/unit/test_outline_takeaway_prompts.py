"""Assertion-first outline prompt contract tests."""

from types import SimpleNamespace

from services.prompts import (
    get_outline_generation_prompt,
    get_outline_generation_prompt_markdown,
    get_outline_refinement_prompt,
)


def _context():
    return SimpleNamespace(
        idea_prompt='AI infrastructure strategy',
        outline_text=None,
        description_text=None,
        creation_type='idea',
        outline_requirements=None,
        reference_files_content=None,
    )


def test_json_outline_prompt_requires_takeaway_then_evidence():
    prompt = get_outline_generation_prompt(_context(), language='en')

    assert "FIRST point must be the page's takeaway" in prompt
    assert 'Follow the takeaway with 1-2 points giving concrete evidence' in prompt
    assert 'functional pages' in prompt


def test_markdown_outline_prompt_requires_complete_assertion_storyline():
    prompt = get_outline_generation_prompt_markdown(_context(), language='en')

    assert 'one complete assertion sentence' in prompt
    assert 'never topic phrases' in prompt
    assert 'coherent storyline' in prompt


def test_outline_refinement_preserves_takeaway_contract():
    prompt = get_outline_refinement_prompt(
        [{'title': 'Compute', 'points': ['Old point']}],
        'Make it clearer',
        _context(),
        language='en',
    )

    assert "FIRST point must be the page's takeaway" in prompt
    assert 'functional pages' in prompt
