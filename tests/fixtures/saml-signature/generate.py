"""独立 XMLDSig fixture 生成。秘密鍵はプロセスのメモリにのみ保持する。"""

from base64 import b64decode, b64encode
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from lxml import etree as E

OUT = Path(__file__).parent
P = "urn:oasis:names:tc:SAML:2.0:protocol"
A = "urn:oasis:names:tc:SAML:2.0:assertion"
D = "http://www.w3.org/2000/09/xmldsig#"
C = "http://www.w3.org/2001/10/xml-exc-c14n#"
S = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
H = "http://www.w3.org/2001/04/xmlenc#sha256"
NS = {"samlp": P, "saml": A, "ds": D}


def sub(parent, ns, local, text=None, **attrs):
    element = E.SubElement(parent, f"{{{ns}}}{local}", **attrs)
    element.text = text
    return element


def credential(bits, name, subject_public_key=None):
    key = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(subject_public_key or key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime(2025, 1, 1, tzinfo=timezone.utc))
        .not_valid_after(datetime(2035, 1, 1, tzinfo=timezone.utc))
        .sign(key, hashes.SHA256())
    )
    return key, cert


def response(default_ns=False):
    mapping = {None: P, "a": A, "ds": D, "extra": "urn:example:extra"} if default_ns else NS
    root = E.Element(f"{{{P}}}Response", nsmap=mapping)
    root.set("Destination", "https://sp.example.test/acs")
    root.set("ID", "_response")
    root.set("Version", "2.0")
    root.set("IssueInstant", "2026-11-08T00:00:00Z")
    sub(root, A, "Issuer", "https://idp.example.test")
    status = sub(root, P, "Status")
    sub(status, P, "StatusCode", Value="urn:oasis:names:tc:SAML:2.0:status:Success")
    return root


def assertion(root, identifier, name):
    target = sub(root, A, "Assertion", ID=identifier, Version="2.0")
    sub(target, A, "Issuer", "https://idp.example.test")
    subject = sub(target, A, "Subject")
    sub(subject, A, "NameID", name)
    statement = sub(target, A, "AttributeStatement")
    attribute = sub(statement, A, "Attribute", Name="role")
    sub(attribute, A, "AttributeValue", "reader & editor")
    return target


def canonical(element, prefixes=None):
    return E.tostring(element, method="c14n", exclusive=True, with_comments=False, inclusive_ns_prefixes=prefixes)


def sign(target, key, cert, *, wrong_digest=False, inclusive=False):
    signature = E.Element(f"{{{D}}}Signature", nsmap={"ds": D})
    target.insert(1, signature)
    info = sub(signature, D, "SignedInfo")
    method = sub(info, D, "CanonicalizationMethod", Algorithm=C)
    if inclusive:
        E.SubElement(method, f"{{{C}}}InclusiveNamespaces", nsmap={"ec": C}, PrefixList="samlp saml")
    sub(info, D, "SignatureMethod", Algorithm=S)
    ref = sub(info, D, "Reference", URI="#" + target.get("ID"))
    transforms = sub(ref, D, "Transforms")
    sub(transforms, D, "Transform", Algorithm=D + "enveloped-signature")
    sub(transforms, D, "Transform", Algorithm=C)
    sub(ref, D, "DigestMethod", Algorithm=H)
    cloned = deepcopy(target)
    cloned.remove(cloned.find(f"{{{D}}}Signature"))
    digest = sha256(canonical(cloned)).digest()
    sub(ref, D, "DigestValue", b64encode(bytes(32) if wrong_digest else digest).decode())
    value = key.sign(canonical(info, ["samlp", "saml"] if inclusive else None), padding.PKCS1v15(), hashes.SHA256())
    sub(signature, D, "SignatureValue", b64encode(value).decode())
    key_info = sub(signature, D, "KeyInfo")
    data = sub(key_info, D, "X509Data")
    sub(data, D, "X509Certificate", b64encode(cert.public_bytes(serialization.Encoding.DER)).decode())
    return signature


def verify_independent(root, key, *, wrong_digest=False, inclusive=False):
    for signature in root.findall(f".//{{{D}}}Signature"):
        info = signature.find(f"{{{D}}}SignedInfo")
        value = b64decode(signature.findtext(f"{{{D}}}SignatureValue"))
        key.public_key().verify(value, canonical(info, ["samlp", "saml"] if inclusive else None), padding.PKCS1v15(), hashes.SHA256())
        target = deepcopy(signature.getparent())
        target.remove(target.find(f"{{{D}}}Signature"))
        expected = b64decode(info.findtext(f"{{{D}}}Reference/{{{D}}}DigestValue"))
        actual = sha256(canonical(target)).digest()
        assert (expected != actual) if wrong_digest else (expected == actual)


def save(name, root):
    OUT.joinpath(name + ".xml").write_bytes(E.tostring(root, xml_declaration=True, encoding="UTF-8"))


def main():
    key, cert = credential(2048, "SAML synthetic test signer")
    other_key, other_cert = credential(2048, "SAML unrelated test signer")
    weak_key, weak_cert = credential(1024, "SAML weak test signer")
    # 署名検証対象の公開鍵長だけを試すため、CA 署名鍵とは別の合成 modulus を使う。
    # 9216 bit の秘密鍵は生成・保持しない。CA 信頼を検証しない製品の上限テスト用。
    _, overlong_cert = credential(2048, "SAML overlong public modulus", rsa.RSAPublicNumbers(65537, (1 << 9215) + 1).public_key())
    for filename, public_cert in [("certificate.pem", cert), ("other-certificate.pem", other_cert), ("weak-certificate.pem", weak_cert), ("overlong-certificate.pem", overlong_cert)]:
        OUT.joinpath(filename).write_bytes(public_cert.public_bytes(serialization.Encoding.PEM))
    del other_key

    root = response()
    assertion(root, "_assertion", "alice@example.test")
    sign(root, key, cert)
    verify_independent(root, key)
    save("response", root)
    tampered = deepcopy(root)
    tampered.find(f".//{{{A}}}NameID").text = "mallory@example.test"
    save("tampered-content", tampered)
    tampered = deepcopy(root)
    value = tampered.find(f".//{{{D}}}SignatureValue")
    value.text = ("A" if value.text[0] != "A" else "B") + value.text[1:]
    save("tampered-signature", tampered)

    root = response()
    target = assertion(root, "_assertion", "alice@example.test")
    sign(target, key, cert)
    verify_independent(root, key)
    save("assertion", root)
    sign(root, key, cert)
    verify_independent(root, key)
    save("both", root)

    root = response()
    assertion(root, "_unsigned", "unsigned@example.test")
    for identifier, name in [("_second", "second@example.test"), ("_third", "third@example.test")]:
        sign(assertion(root, identifier, name), key, cert)
    verify_independent(root, key)
    save("multiple", root)

    root = response(default_ns=True)
    target = assertion(root, "_assertion", "日本語 & whitespace\n  preserved\tvalue")
    root.text = "\n  "
    for child in root:
        child.tail = "\n  "
    target.text = "\n    "
    for child in target:
        child.tail = "\n    "
    E.SubElement(target, "{urn:example:extra}Meta", nsmap={"local": "urn:example:extra"}, z="last", a="first").text = "A\rB"
    target.append(E.Comment("This comment is excluded from the digest"))
    sign(target, key, cert)
    sign(root, key, cert)
    verify_independent(root, key)
    save("namespaces", root)

    for filename, chosen_key, chosen_cert, options in [
        ("weak", weak_key, weak_cert, {}),
        ("wrong-digest", key, cert, {"wrong_digest": True}),
        ("inclusive-prefixes", key, cert, {"inclusive": True}),
    ]:
        root = response()
        assertion(root, "_assertion", "alice@example.test")
        sign(root, chosen_key, chosen_cert, **options)
        verify_independent(root, chosen_key, **options)
        save(filename, root)
    print("Generated 10 synthetic XML fixtures and 4 public certificates; private keys were never serialized.")


if __name__ == "__main__":
    main()
