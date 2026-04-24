import glob, os

OLD = '  </nav>\n</aside>'
NEW = (
    '    <div class="section-label" id="label-admin" style="display:none">Administração</div>\n'
    '    <a href="usuarios.html" id="link-usuarios" style="display:none"><span class="icon">\U0001f464</span> Usuários</a>\n'
    '  </nav>\n'
    '  <div class="sidebar-footer">\n'
    '    <div class="sidebar-user">\n'
    '      <span class="user-name" id="sidebar-nome">—</span>\n'
    '      <span class="user-role" id="sidebar-role"></span>\n'
    '    </div>\n'
    '    <button class="btn-logout" onclick="logout()">↪ Sair</button>\n'
    '  </div>\n'
    '</aside>'
)

skip = {'login.html', 'usuarios.html'}
base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public')
files = glob.glob(os.path.join(base, '*.html'))

for f in files:
    name = os.path.basename(f)
    if name in skip:
        continue
    with open(f, 'r', encoding='utf-8') as fp:
        content = fp.read()
    if OLD in content:
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(content.replace(OLD, NEW, 1))
        print('OK:', name)
    else:
        print('SKIP:', name)
