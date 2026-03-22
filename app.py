import os
import uuid
import hashlib
import json
import requests
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, render_template

app = Flask(__name__)
app.secret_key = 'dujana-spare-parts-secret-key-2024-xK9mP'
app.permanent_session_lifetime = timedelta(days=7)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, 'static', 'uploads')

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}

# ─── TELEGRAM CONFIG ────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN = "8646962029:AAFozLihNSlF1oPALyVa2RRHVnthb0K2Uvk"
TELEGRAM_CHAT_ID   = "8189725568"
TELEGRAM_API       = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

PRODUCTS_TAG = "#DUJANA_PRODUCTS"
ADMINS_TAG   = "#DUJANA_ADMINS"

_DB_CACHE    = {"products": {}, "admins": {}}
_INITIALIZED = False


# ─── HELPERS ────────────────────────────────────────────────────────────────────

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def sha256_hash(password):
    return hashlib.sha256(password.encode()).hexdigest()


# ─── TELEGRAM LAYER ─────────────────────────────────────────────────────────────

def _tg_send_message(text):
    try:
        requests.post(
            f"{TELEGRAM_API}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID, "text": text},
            timeout=15
        )
    except Exception as e:
        print(f"[TG] sendMessage error: {e}")

def _tg_send_photo(filepath, caption=""):
    try:
        with open(filepath, "rb") as f:
            resp = requests.post(
                f"{TELEGRAM_API}/sendPhoto",
                data={"chat_id": TELEGRAM_CHAT_ID, "caption": caption},
                files={"photo": f},
                timeout=30
            )
        return resp.json()
    except Exception as e:
        print(f"[TG] sendPhoto error: {e}")
        return {}

def _tg_get_file_url(file_id):
    try:
        resp = requests.get(
            f"{TELEGRAM_API}/getFile",
            params={"file_id": file_id},
            timeout=10
        )
        data = resp.json()
        if data.get("ok"):
            path = data["result"]["file_path"]
            return f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{path}"
    except Exception as e:
        print(f"[TG] getFile error: {e}")
    return ""

def _fetch_latest_snapshot(tag):
    """Scan recent Telegram updates and return the latest JSON snapshot for tag."""
    try:
        resp = requests.get(
            f"{TELEGRAM_API}/getUpdates",
            params={"limit": 100, "allowed_updates": ["message"]},
            timeout=15
        )
        data = resp.json()
        if not data.get("ok"):
            return None
        messages = [u.get("message", {}) for u in data.get("result", [])]
        for msg in reversed(messages):
            text = msg.get("text", "")
            if text.startswith(tag + "\n"):
                payload = text[len(tag) + 1:]
                return json.loads(payload)
    except Exception as e:
        print(f"[TG] fetch snapshot error for {tag}: {e}")
    return None

def _push_snapshot(tag, data):
    """Push a full JSON snapshot of a collection to the Telegram chat."""
    text = f"{tag}\n{json.dumps(data, ensure_ascii=False)}"
    _tg_send_message(text)

def _load_from_telegram():
    global _DB_CACHE, _INITIALIZED
    products_snap = _fetch_latest_snapshot(PRODUCTS_TAG)
    admins_snap   = _fetch_latest_snapshot(ADMINS_TAG)
    if products_snap is not None:
        _DB_CACHE["products"] = products_snap
    if admins_snap is not None:
        _DB_CACHE["admins"] = admins_snap
    _INITIALIZED = True

def _seed_defaults_if_empty():
    changed = False
    if not _DB_CACHE["admins"]:
        default_id = str(uuid.uuid4())
        _DB_CACHE["admins"][default_id] = {
            "id": default_id,
            "username": "admin",
            "password_hash": sha256_hash("admin123"),
            "full_name": "Super Admin",
            "role": "superadmin",
            "created_at": datetime.now().isoformat()
        }
        changed = True
    if not _DB_CACHE["products"]:
        sample = [
            {"id": str(uuid.uuid4()), "name_en": "Brake Disc Set", "name_am": "የብሬክ ዲስክ ስብስብ",
             "price": 2500.0, "category_en": "Brakes", "category_am": "ብሬክ", "stock": 15,
             "desc_en": "High-performance brake disc set.", "desc_am": "ከፍተኛ አፈጻጸም ያለው የብሬክ ዲስክ።",
             "image_filename": "", "tg_file_id": "",
             "seller_en": "Dujana Auto Parts", "seller_am": "ዱጃና የመኪና ዕቃዎች",
             "phone": "+251911234567", "created_at": datetime.now().isoformat()},
            {"id": str(uuid.uuid4()), "name_en": "Oil Filter Premium", "name_am": "ፕሪሚየም የዘይት ፍልተር",
             "price": 450.0, "category_en": "Filters", "category_am": "ፍልተሮች", "stock": 50,
             "desc_en": "Premium quality oil filter.", "desc_am": "ፕሪሚየም ጥራት ያለው የዘይት ፍልተር።",
             "image_filename": "", "tg_file_id": "",
             "seller_en": "Dujana Auto Parts", "seller_am": "ዱጃና የመኪና ዕቃዎች",
             "phone": "+251911234567", "created_at": datetime.now().isoformat()},
        ]
        for p in sample:
            _DB_CACHE["products"][p["id"]] = p
        changed = True
    if changed:
        _push_snapshot(PRODUCTS_TAG, _DB_CACHE["products"])
        _push_snapshot(ADMINS_TAG,   _DB_CACHE["admins"])

def _ensure_initialized():
    global _INITIALIZED
    if not _INITIALIZED:
        _load_from_telegram()
        _seed_defaults_if_empty()


# ─── DB FUNCTIONS ────────────────────────────────────────────────────────────────

def read_products():
    _ensure_initialized()
    products = []
    for p in sorted(_DB_CACHE["products"].values(),
                    key=lambda x: x.get("created_at", ""), reverse=True):
        image_filename = p.get("image_filename", "")
        tg_file_id     = p.get("tg_file_id", "")
        if image_filename and os.path.exists(os.path.join(UPLOADS_DIR, image_filename)):
            image_path = f"/static/uploads/{image_filename}"
        elif tg_file_id:
            image_path = _tg_get_file_url(tg_file_id)
        else:
            image_path = ""
        products.append({
            "id": p["id"], "name_en": p.get("name_en",""), "name_am": p.get("name_am",""),
            "price": p.get("price",0), "category_en": p.get("category_en",""),
            "category_am": p.get("category_am",""), "stock": p.get("stock",0),
            "desc_en": p.get("desc_en",""), "desc_am": p.get("desc_am",""),
            "image_path": image_path, "image_filename": image_filename, "tg_file_id": tg_file_id,
            "seller_en": p.get("seller_en",""), "seller_am": p.get("seller_am",""),
            "phone": p.get("phone",""), "created_at": p.get("created_at",""),
        })
    return products

def write_product(product_data, product_id=None):
    _ensure_initialized()
    pid      = product_id or product_data.get("id") or str(uuid.uuid4())
    existing = _DB_CACHE["products"].get(pid, {})
    record = {
        "id":             pid,
        "name_en":        product_data.get("name_en",        existing.get("name_en","")),
        "name_am":        product_data.get("name_am",        existing.get("name_am","")),
        "price":          float(product_data.get("price",    existing.get("price",0))),
        "category_en":    product_data.get("category_en",   existing.get("category_en","")),
        "category_am":    product_data.get("category_am",   existing.get("category_am","")),
        "stock":          int(product_data.get("stock",     existing.get("stock",0))),
        "desc_en":        product_data.get("desc_en",       existing.get("desc_en","")),
        "desc_am":        product_data.get("desc_am",       existing.get("desc_am","")),
        "image_filename": product_data.get("image_filename", existing.get("image_filename","")),
        "tg_file_id":     product_data.get("tg_file_id",    existing.get("tg_file_id","")),
        "seller_en":      product_data.get("seller_en",     existing.get("seller_en","")),
        "seller_am":      product_data.get("seller_am",     existing.get("seller_am","")),
        "phone":          product_data.get("phone",         existing.get("phone","")),
        "created_at":     existing.get("created_at") or product_data.get("created_at", datetime.now().isoformat()),
    }
    _DB_CACHE["products"][pid] = record
    _push_snapshot(PRODUCTS_TAG, _DB_CACHE["products"])
    _tg_send_message(
        f"{'🔄 Updated' if existing else '✅ New'} product: {record['name_en']} / {record['name_am']}\n"
        f"Price: {record['price']} ETB | Stock: {record['stock']}\n"
        f"Category: {record['category_en']} | Seller: {record['seller_en']}\n"
        f"Phone: {record['phone']}"
    )

def delete_product(product_id):
    _ensure_initialized()
    product = _DB_CACHE["products"].pop(product_id, None)
    _push_snapshot(PRODUCTS_TAG, _DB_CACHE["products"])
    if product:
        _tg_send_message(f"🗑️ Product deleted: {product.get('name_en', product_id)}")

def check_admin_login(username, password):
    _ensure_initialized()
    hashed = sha256_hash(password)
    for admin in _DB_CACHE["admins"].values():
        if admin["username"] == username and admin["password_hash"] == hashed:
            return {"id": admin["id"], "username": admin["username"],
                    "full_name": admin.get("full_name",""), "role": admin.get("role","admin")}
    return None

def update_admin_password(admin_id, old_password, new_password):
    _ensure_initialized()
    admin = _DB_CACHE["admins"].get(admin_id)
    if not admin:
        return False, "Admin not found"
    if admin["password_hash"] != sha256_hash(old_password):
        return False, "Current password is incorrect"
    admin["password_hash"] = sha256_hash(new_password)
    _DB_CACHE["admins"][admin_id] = admin
    _push_snapshot(ADMINS_TAG, _DB_CACHE["admins"])
    _tg_send_message(f"🔐 Password changed for admin: {admin['username']}")
    return True, "Password updated successfully"

def upload_image_to_telegram(filepath, product_name=""):
    result = _tg_send_photo(filepath, caption=f"📸 Product image: {product_name}")
    if result.get("ok"):
        photo_list = result["result"].get("photo", [])
        if photo_list:
            return photo_list[-1]["file_id"]
    return ""


# ─── DECORATORS ─────────────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'admin_id' not in session:
            return jsonify({'error': 'Unauthorized', 'message': 'Login required'}), 401
        return f(*args, **kwargs)
    return decorated


# ─── ROUTES ─────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/uploads/<filename>')
def uploaded_image(filename):
    return send_from_directory(UPLOADS_DIR, filename)

@app.route('/api/products', methods=['GET'])
def get_products():
    products  = read_products()
    search    = request.args.get('search', '').lower()
    category  = request.args.get('category', '')
    min_price = request.args.get('min_price', type=float)
    max_price = request.args.get('max_price', type=float)
    if search:
        products = [p for p in products if
                    search in p['name_en'].lower() or search in p['name_am'].lower() or
                    search in p['desc_en'].lower() or search in p['category_en'].lower()]
    if category:
        products = [p for p in products if p['category_en'].lower() == category.lower()]
    if min_price is not None:
        products = [p for p in products if p['price'] >= min_price]
    if max_price is not None:
        products = [p for p in products if p['price'] <= max_price]
    return jsonify({'products': products, 'total': len(products)})

@app.route('/api/products/<product_id>', methods=['GET'])
def get_product(product_id):
    products = read_products()
    product  = next((p for p in products if p['id'] == product_id), None)
    if not product:
        return jsonify({'error': 'Product not found'}), 404
    return jsonify({'product': product})

@app.route('/api/products', methods=['POST'])
@login_required
def create_product():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    required = ['name_en', 'name_am', 'price', 'category_en', 'category_am']
    for field in required:
        if not str(data.get(field, '')).strip():
            return jsonify({'error': f'Field {field} is required'}), 400
    product_id  = str(uuid.uuid4())
    new_product = {
        'id': product_id, 'name_en': data.get('name_en',''), 'name_am': data.get('name_am',''),
        'price': float(data.get('price',0)), 'category_en': data.get('category_en',''),
        'category_am': data.get('category_am',''), 'stock': int(data.get('stock',0)),
        'desc_en': data.get('desc_en',''), 'desc_am': data.get('desc_am',''),
        'image_filename': data.get('image_filename',''), 'tg_file_id': data.get('tg_file_id',''),
        'seller_en': data.get('seller_en',''), 'seller_am': data.get('seller_am',''),
        'phone': data.get('phone',''), 'created_at': datetime.now().isoformat()
    }
    write_product(new_product)
    return jsonify({'product': new_product, 'message': 'Product created successfully'}), 201

@app.route('/api/products/<product_id>', methods=['PUT'])
@login_required
def update_product(product_id):
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    products = read_products()
    product  = next((p for p in products if p['id'] == product_id), None)
    if not product:
        return jsonify({'error': 'Product not found'}), 404
    updated = {
        'name_en': data.get('name_en', product['name_en']),
        'name_am': data.get('name_am', product['name_am']),
        'price':   float(data.get('price', product['price'])),
        'category_en': data.get('category_en', product['category_en']),
        'category_am': data.get('category_am', product['category_am']),
        'stock':   int(data.get('stock', product['stock'])),
        'desc_en': data.get('desc_en', product['desc_en']),
        'desc_am': data.get('desc_am', product['desc_am']),
        'image_filename': data.get('image_filename', product['image_filename']),
        'tg_file_id':     data.get('tg_file_id',    product.get('tg_file_id','')),
        'seller_en': data.get('seller_en', product['seller_en']),
        'seller_am': data.get('seller_am', product['seller_am']),
        'phone':     data.get('phone',     product['phone']),
    }
    write_product(updated, product_id)
    updated['id']         = product_id
    updated['created_at'] = product['created_at']
    return jsonify({'product': updated, 'message': 'Product updated successfully'})

@app.route('/api/products/<product_id>', methods=['DELETE'])
@login_required
def delete_product_route(product_id):
    products = read_products()
    if not any(p['id'] == product_id for p in products):
        return jsonify({'error': 'Product not found'}), 404
    delete_product(product_id)
    return jsonify({'message': 'Product deleted successfully'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    username = data.get('username', '')
    password = data.get('password', '')
    admin = check_admin_login(username, password)
    if not admin:
        return jsonify({'error': 'Invalid username or password'}), 401
    session.permanent          = True
    session['admin_id']        = admin['id']
    session['admin_username']  = admin['username']
    session['admin_full_name'] = admin['full_name']
    session['admin_role']      = admin['role']
    _tg_send_message(f"🔓 Admin login: {admin['username']} at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    return jsonify({'message': 'Login successful', 'admin': admin})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'})

@app.route('/api/check-auth', methods=['GET'])
def check_auth():
    if 'admin_id' in session:
        return jsonify({'authenticated': True, 'admin': {
            'id': session['admin_id'], 'username': session['admin_username'],
            'full_name': session['admin_full_name'], 'role': session['admin_role'],
        }})
    return jsonify({'authenticated': False})

@app.route('/api/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    old_password     = data.get('old_password', '').strip()
    new_password     = data.get('new_password', '').strip()
    confirm_password = data.get('confirm_password', '').strip()
    if not old_password:
        return jsonify({'error': 'Current password is required'}), 400
    if not new_password:
        return jsonify({'error': 'New password is required'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'New password must be at least 6 characters'}), 400
    if new_password != confirm_password:
        return jsonify({'error': 'New passwords do not match'}), 400
    if old_password == new_password:
        return jsonify({'error': 'New password must be different from current password'}), 400
    success, message = update_admin_password(session['admin_id'], old_password, new_password)
    if not success:
        return jsonify({'error': message}), 401
    return jsonify({'message': message})

@app.route('/api/upload-image', methods=['POST'])
@login_required
def upload_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed. Use jpg, jpeg, png, gif, or webp'}), 400
    ext             = file.filename.rsplit('.', 1)[1].lower()
    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    filepath        = os.path.join(UPLOADS_DIR, unique_filename)
    file.save(filepath)
    # Upload to Telegram for persistent cloud storage
    tg_file_id = upload_image_to_telegram(filepath, product_name="new upload")
    return jsonify({
        'message':        'Image uploaded successfully',
        'image_filename': unique_filename,
        'image_path':     f'/static/uploads/{unique_filename}',
        'tg_file_id':     tg_file_id,
    })

@app.route('/api/categories', methods=['GET'])
def get_categories():
    products   = read_products()
    categories = {}
    for p in products:
        key = p['category_en']
        if key not in categories:
            categories[key] = p['category_am']
    return jsonify({'categories': [{'en': k, 'am': v} for k, v in categories.items()]})


if __name__ == '__main__':
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    _ensure_initialized()
    app.run(debug=True, host='0.0.0.0', port=5000)
