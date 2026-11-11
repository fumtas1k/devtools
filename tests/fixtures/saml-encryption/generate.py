"""試験鍵と Assertion から、新しい乱数を使って XML Encryption fixture を生成する。"""
from pathlib import Path
import subprocess
import sys

from lxml import etree
import xmlsec

if len(sys.argv) != 2:
    raise SystemExit('usage: python generate.py OUTPUT_DIRECTORY')
source = Path(__file__).resolve().parent
out = Path(sys.argv[1]).resolve()
if out == source:
    raise SystemExit('出力先には fixture ディレクトリと別の場所を指定してください')
out.mkdir(parents=True, exist_ok=True)
pem = (source / 'trial-key.pem').read_bytes()
pub = subprocess.run(
    ['openssl', 'pkey', '-pubout'], input=pem, check=True, capture_output=True
).stdout
assertion = (source / 'expected.xml').read_bytes()

for size, transform in [(128, xmlsec.Transform.AES128_GCM), (256, xmlsec.Transform.AES256_GCM)]:
    root = etree.fromstring(b'<root>' + assertion + b'</root>')
    template = xmlsec.template.encrypted_data_create(
        root, transform, type=xmlsec.EncryptionType.ELEMENT, ns='xenc'
    )
    xmlsec.template.encrypted_data_ensure_cipher_value(template)
    info = xmlsec.template.encrypted_data_ensure_key_info(template, ns='ds')
    encrypted_key = xmlsec.template.add_encrypted_key(info, xmlsec.Transform.RSA_OAEP)
    xmlsec.template.encrypted_data_ensure_cipher_value(encrypted_key)
    key_info = xmlsec.template.encrypted_data_ensure_key_info(encrypted_key, ns='ds')
    xmlsec.template.add_key_name(key_info, 'trial')
    manager = xmlsec.KeysManager()
    key = xmlsec.Key.from_memory(pub, xmlsec.KeyFormat.PEM)
    key.name = 'trial'
    manager.add_key(key)
    ctx = xmlsec.EncryptionContext(manager)
    ctx.key = xmlsec.Key.generate(xmlsec.KeyData.AES, size, xmlsec.KeyDataType.SESSION)
    encrypted = ctx.encrypt_xml(template, root[0])
    response = etree.Element(
        '{urn:oasis:names:tc:SAML:2.0:protocol}Response',
        nsmap={'samlp': 'urn:oasis:names:tc:SAML:2.0:protocol',
               'saml': 'urn:oasis:names:tc:SAML:2.0:assertion'},
    )
    wrapper = etree.SubElement(response, '{urn:oasis:names:tc:SAML:2.0:assertion}EncryptedAssertion')
    wrapper.append(encrypted)
    (out / f'xmlsec-aes{size}.xml').write_bytes(
        etree.tostring(response, encoding='UTF-8', xml_declaration=True)
    )
