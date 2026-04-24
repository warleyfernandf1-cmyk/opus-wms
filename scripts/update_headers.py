import glob, os, re

NEW_RIGHT = (
    '  <div class="header-right">\n'
    '    <span class="header-datetime" id="header-datetime"></span>\n'
    '    <div class="header-user-info">\n'
    '      <span class="header-nome" id="header-nome">—</span>\n'
    '      <span class="header-role" id="header-role"></span>\n'
    '    </div>\n'
    '    <button class="btn-header-logout" onclick="logout()">&#x21AA; Sair</button>\n'
    '  </div>\n'
    '</header>'
)

base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public')
files = glob.glob(os.path.join(base, '*.html'))

skip = {'login.html'}

for f in files:
    name = os.path.basename(f)
    if name in skip:
        continue
    with open(f, 'r', encoding='utf-8') as fp:
        content = fp.read()

    # Substitui <span class="badge">...</span> + </header> em qualquer formato
    new_content, count = re.subn(
        r'\s*<span class="badge">[^<]*</span>\s*</header>',
        '\n' + NEW_RIGHT,
        content,
    )

    if count:
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(new_content)
        print('OK:', name)
    else:
        print('SKIP:', name)
