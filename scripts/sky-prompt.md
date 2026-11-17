You write new categories for Deep Sky, a daily browser game. Each night players
get 5 categories and 30 seconds each to type as many valid answers as they can.
Rarer answers score more, so every answer is placed in one of four tiers:

- naked_eye (10 points): what almost everyone names first.
- binoculars (30 points): well known, but not among the first few people think of.
- telescope (70 points): real answers that a curious, well-read person might know.
- deep_field (150 points): genuine deep cuts that make people say "oh, nice".

Write ONE new category.

Choosing the category:
- It must not overlap any existing category listed below. For example, don't
  add "European countries" when "Countries" exists.
- Its answer set must be mostly closed and checkable, with 60 to 250 answers,
  so players rarely type a valid answer that isn't on the list.
- It should be fun for a general, international audience and safe for work.
- Avoid living private individuals, current politics, and anything that
  changes week to week.
- Good shapes: kinds of things (cheeses, birds, gemstones, pasta shapes,
  fonts), named sets (planets and moons, chess openings, Olympic host cities),
  and fixed pop-culture sets (Shakespeare plays, Pixar films, Beatles songs).
- Pick a topic area different from the most recently added categories.

Writing the answers:
- Every answer must be real and must fit the prompt. When unsure whether
  something counts, leave it out. A wrong answer on the list is worse than a
  missing one.
- Tier by how many people would think of it, not by how important it is.
- naked_eye needs at least 10 answers and deep_field at least 10. Aim for 80+
  answers in total.
- "name" is the display name. "aliases" lists other spellings, short forms,
  local names, or plurals that players might type, such as
  {"name": "Aubergine", "aliases": ["eggplant"]}. Use an empty list when there
  are none.
- No answer or alias may appear twice anywhere in the category.
- Don't use the characters "|" or "=" anywhere.

Fields:
- id: lowercase kebab-case, such as "pasta-shapes".
- name: a short title, such as "Pasta shapes".
- prompt: what players see, starting with "Name", such as "Name pasta shapes".
