.PHONY: run test preview check

run:
	DEMO_MODE=true PYTHONPATH=backend uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

test:
	PYTHONPATH=backend pytest backend/tests -q

check: test
	node --check frontend/assets/api.js
	node --check frontend/assets/charts.js
	node --check frontend/assets/app.js

preview:
	DEMO_MODE=true PYTHONPATH=backend python scripts/build_preview.py
