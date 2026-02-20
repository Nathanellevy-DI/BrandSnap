from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

app = Flask(__name__)
CORS(app)

@app.route("/scrape", methods=["POST"])
def scrape():
    data = request.get_json()
    url = data.get("url")

    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(response.text, "html.parser")

        # Extract all visible text
        for script in soup(["script", "style", "noscript"]):
            script.decompose()

        text = soup.get_text(separator="\n")
        text = "\n".join(line.strip() for line in text.splitlines() if line.strip())

        # Extract image URLs
        images = []
        for img in soup.find_all("img"):
            src = img.get("src")
            if src:
                full_url = urljoin(url, src)
                images.append(full_url)

        return jsonify({
            "text": text,
            "images": images
        })

    except Exception as e:
        return jsonify({"error": str(e)})

if __name__ == "__main__":

    app.run(host="127.0.0.1", port=5001, debug=True)
