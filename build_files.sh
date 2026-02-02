#!/bin/bash
pip install -r webapp/requirements.txt
cd webapp && python manage.py collectstatic --noinput
