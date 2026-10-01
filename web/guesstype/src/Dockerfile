# Use a standard Python image
FROM python:latest

# Set the folder inside the container where our code will live
WORKDIR /app

# Install Flask directly using pip
RUN pip install flask gunicorn

# Copy your local code files into the container
COPY . .

# Tell the container to listen on port 5000
EXPOSE 1337

ENV FLAG=skbdg{gu355_typ3_par53s_url5_u53_gu355_fil3_typ3_in5t3ad!}

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:1337", "main:app"]
