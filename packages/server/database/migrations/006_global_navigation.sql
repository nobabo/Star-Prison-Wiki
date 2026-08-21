-- Document/category placement is wiki structure, not a per-user preference.
-- Seed the shared row from the most complete, recently edited legacy layout.
INSERT INTO wiki_navigation_preferences (
    user_id,
    categories,
    root_page_slugs,
    favorite_slugs,
    theme,
    revision,
    updated_at
)
SELECT 'wiki:global-navigation', categories, root_page_slugs, '[]'::jsonb, 'dark', 1, NOW()
FROM wiki_navigation_preferences
WHERE user_id <> 'wiki:global-navigation'
ORDER BY jsonb_array_length(categories) DESC, updated_at DESC
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;
