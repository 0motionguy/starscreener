-- Seed fixtures for SQL parity tests.

with item_inserts as (
  insert into trending_items (type, source, source_id, slug, title, url, author, last_modified_at, absolute_popularity, cross_source_count)
  values
    ('hf_model','huggingface','meta-llama/Llama-3-8B','meta-llama-llama-3-8b','Llama 3 8B','https://huggingface.co/meta-llama/Llama-3-8B','meta-llama', now() - interval '2 days',  9000000, 3),
    ('hf_model','huggingface','meta-llama/Llama-3-70B','meta-llama-llama-3-70b','Llama 3 70B','https://huggingface.co/meta-llama/Llama-3-70B','meta-llama', now() - interval '6 days',  3500000, 2),
    ('hf_model','huggingface','mistralai/Mistral-7B','mistralai-mistral-7b','Mistral 7B','https://huggingface.co/mistralai/Mistral-7B','mistralai', now() - interval '1 day',     7800000, 4),
    ('hf_model','huggingface','google/gemma-7b','google-gemma-7b','Gemma 7B','https://huggingface.co/google/gemma-7b','google', now() - interval '14 days', 2400000, 2),
    ('hf_model','huggingface','tiiuae/falcon-7b','tiiuae-falcon-7b','Falcon 7B','https://huggingface.co/tiiuae/falcon-7b','tiiuae', now() - interval '40 days', 800000, 1),
    ('repo','github','vercel/next.js','vercel-nextjs','Next.js','https://github.com/vercel/next.js','vercel', now() - interval '1 day', 130000, 5),
    ('repo','github','ollama/ollama','ollama-ollama','Ollama','https://github.com/ollama/ollama','ollama', now() - interval '2 days', 95000, 3),
    ('repo','github','anthropics/claude-code','anthropics-claude-code','Claude Code','https://github.com/anthropics/claude-code','anthropics', now() - interval '5 days', 22000, 4),
    ('repo','github','openai/openai-python','openai-openai-python','openai-python','https://github.com/openai/openai-python','openai', now() - interval '8 days', 21000, 2),
    ('repo','github','encode/django-rest-framework','encode-django-rest-framework','DRF','https://github.com/encode/django-rest-framework','encode', now() - interval '90 days', 28000, 1),
    ('skill','claude-skills','anthropics/skill-init','init','init','https://claude.com/code/skills/init','anthropics', now() - interval '3 days', 1500, 1),
    ('skill','claude-skills','anthropics/skill-review','review','review','https://claude.com/code/skills/review','anthropics', now() - interval '6 days', 900, 1),
    ('skill','claude-skills','anthropics/skill-loop','loop','loop','https://claude.com/code/skills/loop','anthropics', now() - interval '20 days', 2200, 1),
    ('skill','claude-skills','anthropics/skill-schedule','schedule','schedule','https://claude.com/code/skills/schedule','anthropics', now() - interval '10 days', 1800, 1),
    ('skill','claude-skills','anthropics/skill-update-config','update-config','update-config','https://claude.com/code/skills/update-config','anthropics', now() - interval '4 days', 1100, 1),
    ('mcp','modelcontextprotocol-servers','filesystem','filesystem','filesystem','https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem','modelcontextprotocol', now() - interval '7 days', 8200, 2),
    ('mcp','modelcontextprotocol-servers','github','github','github','https://github.com/modelcontextprotocol/servers/tree/main/src/github','modelcontextprotocol', now() - interval '4 days', 7400, 3),
    ('mcp','modelcontextprotocol-servers','postgres','postgres','postgres','https://github.com/modelcontextprotocol/servers/tree/main/src/postgres','modelcontextprotocol', now() - interval '12 days', 4900, 2),
    ('mcp','modelcontextprotocol-servers','sqlite','sqlite','sqlite','https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite','modelcontextprotocol', now() - interval '21 days', 2300, 1),
    ('mcp','modelcontextprotocol-servers','google-drive','google-drive','google-drive','https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive','modelcontextprotocol', now() - interval '60 days', 1100, 1),
    ('hf_dataset','huggingface','HuggingFaceH4/ultrachat_200k','huggingfaceh4-ultrachat-200k','ultrachat_200k','https://huggingface.co/datasets/HuggingFaceH4/ultrachat_200k','HuggingFaceH4', now() - interval '5 days', 600000, 1),
    ('hf_dataset','huggingface','allenai/c4','allenai-c4','c4','https://huggingface.co/datasets/allenai/c4','allenai', now() - interval '30 days', 450000, 2),
    ('hf_dataset','huggingface','tatsu-lab/alpaca','tatsu-lab-alpaca','alpaca','https://huggingface.co/datasets/tatsu-lab/alpaca','tatsu-lab', now() - interval '120 days', 280000, 1),
    ('hf_dataset','huggingface','EleutherAI/pile','eleutherai-pile','pile','https://huggingface.co/datasets/EleutherAI/pile','EleutherAI', now() - interval '180 days', 320000, 1),
    ('hf_dataset','huggingface','OpenAssistant/oasst1','openassistant-oasst1','oasst1','https://huggingface.co/datasets/OpenAssistant/oasst1','OpenAssistant', now() - interval '60 days', 190000, 1),
    ('hf_space','huggingface','stabilityai/stable-diffusion-xl','stabilityai-stable-diffusion-xl','SDXL Demo','https://huggingface.co/spaces/stabilityai/stable-diffusion-xl','stabilityai', now() - interval '8 days', 200000, 2),
    ('hf_space','huggingface','HuggingFaceH4/zephyr-chat','huggingfaceh4-zephyr-chat','Zephyr Chat','https://huggingface.co/spaces/HuggingFaceH4/zephyr-chat','HuggingFaceH4', now() - interval '12 days', 110000, 1),
    ('hf_space','huggingface','mteb/leaderboard','mteb-leaderboard','MTEB Leaderboard','https://huggingface.co/spaces/mteb/leaderboard','mteb', now() - interval '2 days', 90000, 2),
    ('hf_space','huggingface','open-llm-leaderboard/open_llm_leaderboard','open-llm-leaderboard','Open LLM Leaderboard','https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard','open-llm-leaderboard', now() - interval '3 days', 350000, 3),
    ('hf_space','huggingface','lmsys/chatbot-arena-leaderboard','lmsys-chatbot-arena-leaderboard','Chatbot Arena','https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard','lmsys', now() - interval '6 days', 280000, 2),
    ('idea','hackernews','41234567','self-hosting-llms','Self-hosting LLMs is finally cheap','https://news.ycombinator.com/item?id=41234567','dang', now() - interval '1 day', 1100, 2),
    ('idea','hackernews','41234580','rust-grew-up','Rust grew up','https://news.ycombinator.com/item?id=41234580','dang', now() - interval '3 days', 870, 1),
    ('idea','producthunt','agnt-2026','agnt-launch','AGNT launches the marketplace','https://www.producthunt.com/posts/agnt-launch','mirko', now() - interval '7 days', 540, 1),
    ('idea','devto','typescript-decorators-2026','typescript-decorators','TypeScript decorators in 2026','https://dev.to/foo/ts-decorators','foo', now() - interval '14 days', 220, 1),
    ('idea','reddit','t3_a1b2c3','vibe-coding','Vibe coding considered harmful','https://reddit.com/r/programming/comments/a1b2c3','rust_user', now() - interval '40 days', 110, 1)
  returning id, source, source_id
)
insert into trending_metrics (item_id, captured_at, downloads_total, downloads_7d, stars_total, installs_total, velocity_delta_7d)
select
  i.id,
  now(),
  case i.type
    when 'hf_model' then (i.absolute_popularity * 1.2)::bigint
    when 'hf_dataset' then (i.absolute_popularity * 1.1)::bigint
    when 'hf_space' then (i.absolute_popularity * 0.8)::bigint
    else null
  end,
  case i.type
    when 'hf_model' then (i.absolute_popularity * 0.18)::bigint
    when 'hf_dataset' then (i.absolute_popularity * 0.12)::bigint
    when 'hf_space' then (i.absolute_popularity * 0.20)::bigint
    when 'mcp' then (i.absolute_popularity * 0.10)::bigint
    when 'skill' then (i.absolute_popularity * 0.25)::bigint
    when 'idea' then (i.absolute_popularity * 0.30)::bigint
    else null
  end,
  case when i.type = 'repo' then i.absolute_popularity::bigint else null end,
  case when i.type in ('mcp','skill') then (i.absolute_popularity * 0.40)::bigint else null end,
  ((hashtext(i.source || ':' || i.source_id) % 200) - 100)::double precision
from trending_items i;
