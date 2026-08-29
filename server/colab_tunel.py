# colab_tunel.py — Ejecutar en Google Colab con GPU (T4/L4) para exponer prediccion_service
# Codelab: Aprendizaje automático acelerado con Google Cloud + NVIDIA
# Uso:
#   1) En Colab: Runtime > Change runtime type > T4 GPU
#   2) !pip install cudf-cu12 cuml-cu12 --extra-index-url=https://pypi.nvidia.com
#   3) !pip install flask flask-cors yfinance pyngrok
#   4) Copiar este archivo + prediccion_service.py + server.py al Colab y ejecutar:
#      python colab_tunel.py --ngrok-token TU_TOKEN
#   5) Copiar la URL https://xxxx.ngrok-free.app y pegarla en .env como COLAB_TUNNEL_URL
#
# Alternativa sin ngrok: Colab expone puerto via `from google.colab.output import eval_js` no soportado;
# por eso se usa pyngrok o localtunnel.

import argparse, os, sys, json, time, subprocess

# Instalar dependencias si faltan
try:
    import cudf, cuml
    print(f"[GPU] RAPIDS disponible: cudf {cudf.__version__}")
except ImportError:
    print("[GPU] RAPIDS no instalado — pip install cudf-cu12 cuml-cu12 --extra-index-url=https://pypi.nvidia.com")

# Importar Flask app con endpoints /gpu/* ya definidos en server.py
sys.path.insert(0, os.path.dirname(__file__))
from server import app

def run_with_ngrok(port=5000, authtoken=None):
    try:
        from pyngrok import ngrok, conf
    except ImportError:
        print("Instalando pyngrok...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyngrok", "-q"])
        from pyngrok import ngrok
    if authtoken:
        ngrok.set_auth_token(authtoken)
    # matar tuneles previos
    try:
        ngrok.kill()
    except: pass
    url = ngrok.connect(port, "http").public_url
    print(f"\n{'='*60}")
    print(f"  TUNEL COLAB GPU ACTIVO")
    print(f"  URL publica: {url}")
    print(f"  Endpoints:")
    print(f"    GET  {url}/gpu/health")
    print(f"    POST {url}/gpu/predict  {{'simbolo':'GGAL','horizonte':5,'use_gpu':'auto'}}")
    print(f"    POST {url}/gpu/comparar {{'simbolo':'GGAL'}}")
    print(f"  Pegar en .env local:")
    print(f"    COLAB_TUNNEL_URL={url}")
    print(f"{'='*60}\n")
    return url

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--ngrok-token", type=str, default=os.getenv("NGROK_AUTHTOKEN"))
    parser.add_argument("--no-ngrok", action="store_true", help="solo Flask sin tunel")
    args = parser.parse_args()

    if not args.no_ngrok:
        run_with_ngrok(args.port, args.ngrok_token)
    else:
        print(f"Flask sin tunel en http://0.0.0.0:{args.port}")

    # Verificar GPU antes de arrancar
    try:
        import prediccion_service
        print("Aceleracion:", prediccion_service.get_aceleracion_info())
    except Exception as e:
        print("Aceleracion info error:", e)

    app.run(host="0.0.0.0", port=args.port, debug=False, threaded=True)
