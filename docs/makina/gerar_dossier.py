#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera o Dossier Técnico bilingue (PT + EN) da aplicação PayInter
emitido em nome da Makina Company.

Uso:  python3 gerar_dossier.py
Saída: Dossier_Tecnico_PayInter_Makina_Company.pdf

Todos os dados técnicos deste documento foram extraídos directamente do
código-fonte do repositório (commit da branch de trabalho), não de estimativas.
"""
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Preformatted, Spacer,
                                Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon, Group
from reportlab.graphics import renderPDF
from reportlab.platypus.flowables import Flowable

# ----------------------------------------------------------------------------
# Identidade visual
# ----------------------------------------------------------------------------
INK      = colors.HexColor('#0B1220')
ACCENT   = colors.HexColor('#6366F1')
ACCENT_D = colors.HexColor('#4338CA')
CYAN     = colors.HexColor('#06B6D4')
MUTED    = colors.HexColor('#64748B')
LIGHT    = colors.HexColor('#F1F5F9')
LIGHT2   = colors.HexColor('#F8FAFC')
BORDER   = colors.HexColor('#CBD5E1')
OK       = colors.HexColor('#059669')
WARN     = colors.HexColor('#B45309')
WARN_BG  = colors.HexColor('#FFFBEB')
WARN_BD  = colors.HexColor('#FCD34D')
INFO_BG  = colors.HexColor('#EEF2FF')
INFO_BD  = colors.HexColor('#C7D2FE')

COMPANY = 'MAKINA COMPANY'
DOC_TITLE = 'PayInter'
DOC_SUB = 'Dossier Técnico da Aplicação'

# ----------------------------------------------------------------------------
# Estilos
# ----------------------------------------------------------------------------
ss = getSampleStyleSheet()

S = {}
S['body'] = ParagraphStyle('body', parent=ss['BodyText'], fontName='Helvetica',
                           fontSize=9.3, leading=14.2, textColor=INK, alignment=TA_JUSTIFY,
                           spaceAfter=6)
S['body_sm'] = ParagraphStyle('body_sm', parent=S['body'], fontSize=8.4, leading=12.4)
S['h1'] = ParagraphStyle('h1', parent=ss['Heading1'], fontName='Helvetica-Bold',
                         fontSize=15.5, leading=19, textColor=INK, spaceBefore=4, spaceAfter=9)
S['h2'] = ParagraphStyle('h2', parent=ss['Heading2'], fontName='Helvetica-Bold',
                         fontSize=11, leading=14, textColor=ACCENT_D, spaceBefore=10, spaceAfter=5)
S['h3'] = ParagraphStyle('h3', parent=ss['Heading3'], fontName='Helvetica-Bold',
                         fontSize=9.6, leading=12.6, textColor=INK, spaceBefore=7, spaceAfter=3)
S['bullet'] = ParagraphStyle('bullet', parent=S['body'], leftIndent=13, bulletIndent=3,
                             spaceAfter=3.4, alignment=TA_LEFT)
S['cell'] = ParagraphStyle('cell', parent=S['body'], fontSize=8.1, leading=11.2, alignment=TA_LEFT, spaceAfter=0)
S['cellb'] = ParagraphStyle('cellb', parent=S['cell'], fontName='Helvetica-Bold')
S['cellh'] = ParagraphStyle('cellh', parent=S['cell'], fontName='Helvetica-Bold', textColor=colors.white)
S['mono'] = ParagraphStyle('mono', parent=S['cell'], fontName='Courier', fontSize=7.7, leading=10.6)
S['callout_t'] = ParagraphStyle('callout_t', parent=S['body'], fontName='Helvetica-Bold',
                                fontSize=9.4, leading=12.4, spaceAfter=3, alignment=TA_LEFT)
S['callout_b'] = ParagraphStyle('callout_b', parent=S['body'], fontSize=8.6, leading=12.2, spaceAfter=0)
S['cover_t'] = ParagraphStyle('cover_t', parent=S['body'], fontName='Helvetica-Bold',
                              fontSize=32, leading=36, textColor=colors.white, alignment=TA_LEFT)
S['cover_s'] = ParagraphStyle('cover_s', parent=S['body'], fontName='Helvetica',
                              fontSize=13.5, leading=18, textColor=colors.HexColor('#C7D2FE'),
                              alignment=TA_LEFT)
S['cover_co'] = ParagraphStyle('cover_co', parent=S['body'], fontName='Helvetica-Bold',
                               fontSize=15, leading=18, textColor=colors.white,
                               alignment=TA_LEFT)
S['toc_h'] = ParagraphStyle('toc_h', parent=S['h1'], spaceAfter=14)
S['part'] = ParagraphStyle('part', parent=S['body'], fontName='Helvetica-Bold',
                           fontSize=26, leading=30, textColor=INK, alignment=TA_LEFT)


import re

# Etiquetas de formatação que devem sobreviver ao escape (usadas dentro de
# células de tabela para itálico, negrito e tipo de letra monoespaçado).
_TAG = re.compile(r'&lt;(/?(?:i|b|u|sub|super|br)\s*/?|font\b[^&]*?|/font)&gt;')


def esc(t):
    """Escapa texto para XML, sem tocar em etiquetas fora do texto."""
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def rt(t):
    """Escapa o texto mas preserva as etiquetas de formatação permitidas."""
    return _TAG.sub(lambda m: '<%s>' % m.group(1), esc(str(t)))


# ----------------------------------------------------------------------------
# Flowables auxiliares
# ----------------------------------------------------------------------------
class HRule(Flowable):
    def __init__(self, width=None, thickness=0.7, color=BORDER, space=4):
        Flowable.__init__(self)
        self.width_ = width
        self.thickness = thickness
        self.color = color
        self.space = space

    def wrap(self, aw, ah):
        self._aw = aw
        return (aw, self.thickness + self.space)

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        w = self.width_ or self._aw
        self.canv.line(0, self.space / 2, w, self.space / 2)


class Callout(Flowable):
    """Caixa de destaque com barra lateral colorida e texto quebrado."""
    def __init__(self, title, body, kind='info', width=None):
        Flowable.__init__(self)
        self.title = title
        self.body = body
        self.kind = kind
        self.width_ = width
        self._p_t = Paragraph(title, S['callout_t'])
        self._p_b = Paragraph(body, S['callout_b'])

    def wrap(self, aw, ah):
        w = self.width_ or aw
        self._w = w
        inner = w - 26
        _, ht = self._p_t.wrap(inner, ah)
        _, hb = self._p_b.wrap(inner, ah)
        self._ht, self._hb = ht, hb
        self.height = ht + hb + 20
        return (w, self.height)

    def draw(self):
        c = self.canv
        bg, bd, bar = (INFO_BG, INFO_BD, ACCENT) if self.kind == 'info' else (WARN_BG, WARN_BD, WARN)
        c.setFillColor(bg)
        c.setStrokeColor(bd)
        c.setLineWidth(0.6)
        c.roundRect(0, 0, self._w, self.height, 4, stroke=1, fill=1)
        c.setFillColor(bar)
        c.rect(0, 0, 3.4, self.height, stroke=0, fill=1)
        self._p_t.drawOn(c, 14, self.height - self._ht - 9)
        self._p_b.drawOn(c, 14, 10)


def diagram(draw_fn, width, height):
    d = Drawing(width, height)
    draw_fn(d)
    return d


def box(g, x, y, w, h, label, sub=None, fill=LIGHT, stroke=BORDER, tcol=INK,
        font='Helvetica-Bold', fs=8.6, radius=3, subcol=None):
    g.add(Rect(x, y, w, h, rx=radius, ry=radius, fillColor=fill,
               strokeColor=stroke, strokeWidth=0.7))
    if sub:
        g.add(String(x + w / 2, y + h / 2 + 2.4, label, fontName=font, fontSize=fs,
                     fillColor=tcol, textAnchor='middle'))
        g.add(String(x + w / 2, y + h / 2 - 7.4, sub, fontName='Helvetica', fontSize=6.9,
                     fillColor=subcol or MUTED, textAnchor='middle'))
    else:
        g.add(String(x + w / 2, y + h / 2 - 2.8, label, fontName=font, fontSize=fs,
                     fillColor=tcol, textAnchor='middle'))


def arrow(g, x1, y1, x2, y2, col=ACCENT, w=0.9, head=4.2, dash=None):
    if dash:
        g.add(Line(x1, y1, x2, y2, strokeColor=col, strokeWidth=w, strokeDashArray=dash))
    else:
        g.add(Line(x1, y1, x2, y2, strokeColor=col, strokeWidth=w))
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    for s in (0.42, -0.42):
        g.add(Line(x2, y2, x2 - head * math.cos(ang - s), y2 - head * math.sin(ang - s),
                   strokeColor=col, strokeWidth=w))


def caption(text, width):
    return Paragraph(f'<font color="#64748B" size="7.6"><i>{esc(text)}</i></font>', S['body'])


def h1(text):
    return Paragraph(esc(text), S['h1'])


def h2(text):
    return Paragraph(esc(text), S['h2'])


def h3(text):
    return Paragraph(esc(text), S['h3'])


def p(text, style='body'):
    return Paragraph(text, S[style])


def bullets(items, style='bullet'):
    return [Paragraph(t, S[style], bulletText='•') for t in items]


def data_table(rows, widths, header=True, font_small=False):
    st = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4.6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.6),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, BORDER),
        ('BOX', (0, 0), (-1, -1), 0.6, BORDER),
    ]
    if header:
        st += [('BACKGROUND', (0, 0), (-1, 0), ACCENT),
               ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT2])]
    else:
        st += [('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, LIGHT2])]
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    t.setStyle(TableStyle(st))
    return t


def code_block(text, dark=False):
    """Bloco de código com indentação preservada.

    O fundo é desenhado por uma tabela de uma só célula: o Preformatted, por
    si, não pinta o seu próprio backColor, o que deixaria o texto claro
    invisível sobre a página branca.
    """
    if dark:
        stl = ParagraphStyle('cbd', parent=S['mono'], fontSize=7.7, leading=11.8,
                             textColor=colors.HexColor('#E2E8F0'))
        bg, border = colors.HexColor('#0B1220'), colors.HexColor('#0B1220')
    else:
        stl = ParagraphStyle('cbl', parent=S['mono'], fontSize=7.9, leading=11.5,
                             textColor=INK)
        bg, border = LIGHT2, BORDER
    t = Table([[Preformatted(text, stl)]], colWidths=[W_FULL])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('BOX', (0, 0), (-1, -1), 0.6, border),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return t


def T(rows, widths, header=True):
    """Constrói tabela a partir de strings simples (linha 0 = cabeçalho)."""
    out = []
    for i, row in enumerate(rows):
        r = []
        for j, cell in enumerate(row):
            txt = rt(cell)
            if header and i == 0:
                r.append(Paragraph(txt, S['cellh']))
            elif j == 0:
                r.append(Paragraph(txt, S['cellb']))
            else:
                stl = S['mono'] if str(cell).startswith(('/v1', '/ops', 'POST', 'GET', 'PATCH', 'DELETE')) else S['cell']
                r.append(Paragraph(txt, stl))
        out.append(r)
    return data_table(out, widths, header)


# ----------------------------------------------------------------------------
# Documento
# ----------------------------------------------------------------------------
class Dossier(BaseDocTemplate):
    def __init__(self, filename, **kw):
        BaseDocTemplate.__init__(self, filename, **kw)
        frame_cover = Frame(0, 0, A4[0], A4[1], id='cover',
                            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        frame_body = Frame(20 * mm, 20 * mm, A4[0] - 40 * mm, A4[1] - 42 * mm, id='body',
                           leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([
            PageTemplate(id='cover', frames=[frame_cover], onPage=self.cover_page),
            PageTemplate(id='body', frames=[frame_body], onPage=self.body_page),
        ])
        self.part_label = 'PARTE I — PORTUGUÊS'
        self._part2_page = None

    # -- desenho das páginas -------------------------------------------------
    def cover_page(self, canv, doc):
        W, H = A4
        M = 20 * mm          # margem única, igual à do corpo do documento
        canv.saveState()

        # fundo
        canv.setFillColor(INK)
        canv.rect(0, 0, W, H, stroke=0, fill=1)
        canv.setFillColor(colors.HexColor('#101B32'))
        canv.rect(0, H - 150, W, 150, stroke=0, fill=1)

        # cunha de destaque no topo
        canv.setFillColor(ACCENT)
        canv.rect(0, H - 150, W, 3.2, stroke=0, fill=1)

        # ---- cabeçalho: marca da empresa ----
        canv.setFillColor(colors.white)
        canv.roundRect(M, H - 62, 30, 30, 4, stroke=0, fill=1)
        canv.setFillColor(INK)
        canv.setFont('Helvetica-Bold', 17)
        canv.drawCentredString(M + 15, H - 52.5, 'M')
        canv.setFillColor(colors.white)
        canv.setFont('Helvetica-Bold', 12.5)
        canv.drawString(M + 40, H - 45.5, COMPANY)
        canv.setFillColor(colors.HexColor('#8EA0C0'))
        canv.setFont('Helvetica', 7.4)
        canv.drawString(M + 40, H - 57, 'Empresa emitente  ·  Issuing company')
        canv.setStrokeColor(colors.HexColor('#243352'))
        canv.setLineWidth(0.6)
        canv.line(M, H - 80, W - M, H - 80)

        # ---- faixa do título ----
        band_top = H - 300
        band_h = 116
        band_bottom = band_top - band_h
        canv.setFillColor(ACCENT)
        canv.rect(0, band_bottom, W, band_h, stroke=0, fill=1)
        canv.setFillColor(CYAN)
        canv.rect(0, band_bottom - 3, W, 3, stroke=0, fill=1)

        canv.setFillColor(colors.white)
        canv.setFont('Helvetica-Bold', 28)
        canv.drawString(M, band_top - 44, 'Dossier Técnico')
        canv.drawString(M, band_top - 80, 'da Aplicação PayInter')

        # ---- subtítulo e versão ----
        sub = Paragraph(
            'Pagamentos internacionais e carteira multi-moeda, com livro-razão '
            'de partidas dobradas.',
            ParagraphStyle('cs', parent=S['body'], fontName='Helvetica', fontSize=12,
                           leading=17, textColor=colors.HexColor('#C7D2FE'), alignment=TA_LEFT))
        sw, sh = sub.wrap(W - 2 * M, 200)
        sub.drawOn(canv, M, band_bottom - 22 - sh)

        canv.setFillColor(colors.HexColor('#8EA0C0'))
        canv.setFont('Helvetica', 8.6)
        canv.drawString(M, band_bottom - 46 - sh,
                        'Technical Dossier  ·  Versão 1.0  ·  Outubro 2026')

        # ---- bloco de identificação (alinhado à margem) ----
        ident = [
            ['Emitido por / Issued by', COMPANY],
            ['Documento / Document', 'Dossier Técnico da Aplicação PayInter'],
            ['Classificação / Classification', 'Confidencial — uso interno e de parceiros'],
            ['Contacto / Contact', '[EMAIL]  ·  [TELEFONE]  ·  [CIDADE], [PAÍS]'],
            ['Identificação fiscal / Tax ID', '[NIF]'],
        ]
        rows = [
            [Paragraph('<font color="#8EA0C0" size="7.4">%s</font>' % esc(a),
                       ParagraphStyle('ca', parent=S['cell'], leading=10.4)),
             Paragraph('<font color="#E8EDF5" size="8.2"><b>%s</b></font>' % esc(b),
                       ParagraphStyle('cb', parent=S['cell'], leading=10.4))]
            for a, b in ident]
        tbl = Table(rows, colWidths=[(W - 2 * M) * 0.30, (W - 2 * M) * 0.70])
        tbl.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 3.4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3.4),
            ('LINEBELOW', (0, 0), (-1, -2), 0.35, colors.HexColor('#243352')),
        ]))
        tw, th = tbl.wrap(W - 2 * M, 400)
        tbl.drawOn(canv, M, 118)

        # barra inferior
        canv.setFillColor(ACCENT)
        canv.rect(M + 0, 62, 46, 4, stroke=0, fill=1)
        canv.setFillColor(CYAN)
        canv.rect(M + 50, 62, 22, 4, stroke=0, fill=1)
        canv.restoreState()

    def body_page(self, canv, doc):
        W, H = A4
        # PART II começa onde a divisória correspondente foi colocada. O valor é
        # apurado na primeira passagem e reutilizado nas passagens seguintes do
        # multiBuild, de modo a que o rodapé de cada página diga a parte certa.
        label = self.part_label
        if self._part2_page is not None and doc.page >= self._part2_page:
            label = 'PART II — ENGLISH'
        canv.saveState()
        # cabeçalho
        canv.setFillColor(INK)
        canv.setFont('Helvetica-Bold', 7.4)
        canv.drawString(20 * mm, H - 15 * mm, COMPANY)
        canv.setFillColor(MUTED)
        canv.setFont('Helvetica', 7.4)
        canv.drawRightString(W - 20 * mm, H - 15 * mm,
                             f'{DOC_TITLE} — {DOC_SUB}')
        canv.setStrokeColor(BORDER)
        canv.setLineWidth(0.5)
        canv.line(20 * mm, H - 17.6 * mm, W - 20 * mm, H - 17.6 * mm)
        # rodapé
        canv.line(20 * mm, 15.4 * mm, W - 20 * mm, 15.4 * mm)
        canv.setFillColor(MUTED)
        canv.setFont('Helvetica', 7)
        canv.drawString(20 * mm, 11.6 * mm, label)
        canv.drawCentredString(W / 2, 11.6 * mm, 'Documento de demonstração — ambiente sandbox')
        canv.setFillColor(ACCENT_D)
        canv.setFont('Helvetica-Bold', 7.4)
        canv.drawRightString(W - 20 * mm, 11.6 * mm, f'{doc.page}')
        canv.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            n = flowable.style.name
            if n == 'h1':
                self.notify('TOCEntry', (0, flowable.getPlainText(), self.page))
            elif n == 'h2':
                self.notify('TOCEntry', (1, flowable.getPlainText(), self.page))
            elif n == 'part':
                self.notify('TOCEntry', (0, flowable.getPlainText(), self.page))
                if flowable.getPlainText().startswith('PART II'):
                    self._part2_page = self.page


def part_divider(title, subtitle):
    return [Spacer(1, 52),
            Paragraph(esc(title), S['part']),
            Spacer(1, 5),
            HRule(thickness=2.2, color=ACCENT, space=2),
            Spacer(1, 9),
            p(f'<font color="#64748B" size="10">{esc(subtitle)}</font>'),
            PageBreak()]


W_FULL = A4[0] - 40 * mm          # 481.9 pt
CW = [W_FULL * 0.30, W_FULL * 0.70]


# ============================================================================
# CONTEÚDO
# ============================================================================
def build_story():
    st = []
    A = st.append
    X = st.extend

    # ---------------------------------------------------------------- CAPA
    # A capa é desenhada integralmente em coordenadas de página (cover_page),
    # para garantir alinhamento exacto com a margem do corpo do documento.
    A(NextPageTemplate('body'))
    A(PageBreak())

    # ---------------------------------------------------------------- ÍNDICE
    A(Paragraph(esc('Índice  ·  Contents'), S['toc_h']))
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle('toc0', fontName='Helvetica-Bold', fontSize=9.4, leading=15.6,
                       textColor=INK, leftIndent=0, firstLineIndent=0),
        ParagraphStyle('toc1', fontName='Helvetica', fontSize=8.4, leading=13,
                       textColor=MUTED, leftIndent=14, firstLineIndent=0),
    ]
    toc.dotsMinLevel = 0
    A(toc)
    A(PageBreak())

    # ================================================================ PARTE I
    X(part_divider('PARTE I — PORTUGUÊS',
                   'Documentação técnica da aplicação PayInter, emitida pela '
                   + COMPANY + ' como parte integrante do processo de avaliação.'))

    # ---- 1. Sumário executivo
    A(h1('1. Sumário Executivo'))
    A(p('O <b>PayInter</b> é uma aplicação de pagamentos internacionais e carteira '
        'multi-moeda, construída como uma <b>prova de conceito de nível industrial</b>: '
        'o código não é um protótipo de ecrãs, mas um sistema com livro-razão financeiro '
        'de partidas dobradas, autenticação por palavra-passe e PIN, controlo de acessos '
        'por função (RBAC), trilha de auditoria e uma aplicação cliente que continua a '
        'funcionar sem ligação à Internet.'))
    A(p('A aplicação está dividida em três componentes independentes: uma <b>API REST</b> '
        'em Node.js e TypeScript, uma <b>base de dados relacional</b> PostgreSQL com '
        'migrações versionadas, e uma <b>aplicação cliente</b> do tipo PWA '
        '(<i>Progressive Web App</i>) instalável, que pode ser empacotada como aplicação '
        'Android (APK) através do Capacitor.'))
    A(Spacer(1, 3))
    A(h2('1.1. Números do projecto'))
    A(T([
        ['Métrica', 'Valor', 'Nota'],
        ['Endpoints REST implementados', '95', 'Distribuídos por 18 grupos de rotas'],
        ['Tabelas na base de dados', '25', 'Migrações SQL versionadas'],
        ['Linhas de código — servidor', '≈ 6 100', 'Rotas, serviços, bibliotecas, middleware'],
        ['Linhas de código — cliente', '≈ 2 830', '17 ecrãs, sincronização offline'],
        ['Testes automatizados', '34', '5 ficheiros — 100% a passar'],
        ['Dependências de execução', '8', 'Servidor: Express, zod, bcrypt, JWT, PGlite/pg'],
        ['Instalação do cliente', 'PWA + APK', 'Empacotamento Android via Capacitor'],
    ], [W_FULL * 0.42, W_FULL * 0.16, W_FULL * 0.42]))
    A(Spacer(1, 8))
    A(Callout('Aviso essencial — ambiente de demonstração',
              'O PayInter está configurado, por omissão, como <b>sandbox</b> (ambiente de '
              'teste controlado). Não movimenta dinheiro real, não cobra cartões reais e '
              '<b>não possui licença de instituição financeira</b>. Todos os fornecedores '
              '— processamento de cartões, câmbios, verificação de identidade (KYC) e '
              'transferências internacionais — são <b>simulados</b>. Qualquer utilização '
              'com fundos reais exige licenciamento, contratos com fornecedores e '
              'parecer jurídico prévio. Ver capítulo 11.', kind='warn'))

    # ---- 2. Visão geral
    A(h1('2. Visão Geral da Aplicação'))
    A(p('O PayInter foi desenhado para o problema das transferências internacionais e '
        'pagamentos digitais em mercados onde a cobertura bancária é desigual e a '
        'ligação à Internet é intermitente — um contexto que descreve com precisão '
        'Angola e a sua diáspora. A aplicação responde a esse contexto com duas '
        'decisões estruturais:'))
    X(bullets([
        '<b>Funciona offline primeiro.</b> O cliente guarda uma cópia local dos dados do '
        'utilizador e enfileira as operações feitas sem rede, reenviando-as '
        'automaticamente quando a ligação regressa — sem duplicar pagamentos.',
        '<b>O saldo não é um número guardado: é um resultado calculado.</b> Toda a '
        'movimentação de valor passa por um livro-razão de partidas dobradas, o que '
        'permite detectar e corrigir divergências em vez de as esconder.',
    ]))
    A(Spacer(1, 4))
    A(h2('2.1. Módulos funcionais'))
    A(T([
        ['Módulo', 'O que faz', 'Estado'],
        ['Carteira multi-moeda', 'Saldos por divisa (USD, EUR, GBP, CAD, BRL, AOA, ZAR), '
                                 'extracto e detalhe de movimentos', 'Implementado'],
        ['Transferências P2P', 'Envio entre utilizadores por identificador PayTag, com '
                               'taxas e verificação de saldo', 'Implementado'],
        ['Pagamentos QR', 'Geração de código assinado (HMAC) e pagamento por leitura', 'Implementado'],
        ['Pagamentos a terceiros', 'Carregamento de saldo, transferência bancária e '
                                   'carteira móvel', 'Implementado'],
        ['Cartões', 'Emissão de cartão virtual, congelamento, descongelamento e cartão '
                    'predefinido', 'Implementado'],
        ['Transferências internacionais', 'Cotação de câmbio, destinatários e envio '
                                          'internacional', 'Implementado'],
        ['Verificação de identidade (KYC)', 'Submissão de documentos e revisão por '
                                            'operador', 'Implementado'],
        ['Notificações', 'Lista, marcação de leitura e preferências', 'Implementado'],
        ['Apoio ao cliente', 'Pedidos de assistência, mensagens e perguntas frequentes', 'Implementado'],
        ['Segurança da conta', 'PIN, código de uso único (OTP), sessões activas e '
                               'histórico de eventos', 'Implementado'],
        ['Consola de operações', 'Painel administrativo com função e permissões', 'API pronta; '
                                 'interface web ainda não incluída'],
        ['Privacidade', 'Exportação de dados pessoais e extractos de cartão', 'Implementado'],
    ], [W_FULL * 0.26, W_FULL * 0.575, W_FULL * 0.165]))

    # ---- 3. Arquitetura
    A(PageBreak())
    A(h1('3. Arquitectura do Sistema'))
    A(p('A arquitectura segue uma separação estrita em camadas. O cliente nunca escreve '
        'directamente na base de dados: toda a mutação passa por um endpoint validado, '
        'que por sua vez passa por um serviço de domínio, e só depois pelo livro-razão.'))

    def draw_arch(d):
        g = Group()
        w = W_FULL
        # camada cliente
        box(g, 0, 128, w * 0.30, 46, 'CLIENTE', 'PWA instalável · APK Android',
            fill=colors.HexColor('#EEF2FF'), stroke=INFO_BD)
        box(g, w * 0.34, 128, w * 0.30, 46, 'ESTADO OFFLINE',
            'Cache local · fila de saída', fill=colors.HexColor('#ECFEFF'), stroke=CYAN)
        box(g, w * 0.68, 128, w * 0.32, 46, 'INTERFACE', '17 ecrãs · React 18',
            fill=colors.HexColor('#EEF2FF'), stroke=INFO_BD)
        # camada API
        box(g, 0, 70, w * 0.30, 42, 'API REST', 'Express · TypeScript · zod',
            fill=LIGHT, stroke=BORDER)
        box(g, w * 0.34, 70, w * 0.30, 42, 'SEGURANÇA',
            'JWT · RBAC · limites · auditoria', fill=LIGHT, stroke=BORDER)
        box(g, w * 0.68, 70, w * 0.32, 42, 'SERVIÇOS DE DOMÍNIO',
            'Livro-razão · taxas · câmbios · fraude', fill=LIGHT, stroke=BORDER)
        # camada dados
        box(g, 0, 12, w * 0.30, 42, 'BASE DE DADOS', 'PostgreSQL 16 · PGlite',
            fill=colors.HexColor('#F0FDF4'), stroke=colors.HexColor('#86EFAC'))
        box(g, w * 0.34, 12, w * 0.30, 42, 'FORNECEDORES',
            'Simulados em sandbox', fill=colors.HexColor('#FFFBEB'), stroke=WARN_BD)
        box(g, w * 0.68, 12, w * 0.32, 42, 'OBSERVABILIDADE',
            '/ops/health · /ops/metrics', fill=LIGHT2, stroke=BORDER)
        for x in (w * 0.30, w * 0.34, w * 0.64, w * 0.68, w * 0.98):
            pass
        for x in (0.15, 0.49, 0.84):
            arrow(g, w * x, 128, w * x, 113, col=ACCENT_D, head=3.6)
            arrow(g, w * x, 70, w * x, 55, col=ACCENT_D, head=3.6)
        d.add(g)

    A(diagram(draw_arch, W_FULL, 182))
    A(Spacer(1, 3))
    A(caption('Figura 1 — Camadas do sistema. As setas indicam a direcção das chamadas: '
              'o cliente comunica exclusivamente com a API; a API é a única porta de '
              'entrada para a base de dados.', W_FULL))

    A(Spacer(1, 6))
    A(h2('3.1. Organização do repositório'))
    A(T([
        ['Pasta', 'Conteúdo'],
        ['database/migrations/', 'Esquema SQL versionado (0001 a 0003). É a fonte de verdade '
                                 'da estrutura de dados.'],
        ['backend/src/routes/', '18 grupos de rotas: autenticação, carteira, transferências, '
                                'pagamentos, cartões, câmbios, QR, KYC, apoio, privacidade, '
                                'administração.'],
        ['backend/src/services/', 'Lógica de domínio: livro-razão, carteira, taxas, câmbios, '
                                  'fraude, auditoria, notificações.'],
        ['backend/src/middleware/', 'Autenticação, autorização por função, limites de '
                                    'pedidos, idempotência, tratamento de erros.'],
        ['backend/tests/', '34 testes automatizados executados contra uma base de dados '
                           'real em memória.'],
        ['mobile/', 'Aplicação cliente: 17 ecrãs, gestão de sessão, cache local, fila de '
                    'operações offline e <i>service worker</i>.'],
    ], [W_FULL * 0.28, W_FULL * 0.72]))

    # ---- 4. Ledger
    A(PageBreak())
    A(h1('4. Modelo Financeiro — Livro-Razão de Partidas Dobradas'))
    A(p('Esta é a decisão técnica mais importante do projecto e a que mais distingue o '
        'PayInter de uma simples maqueta de aplicação de pagamentos.'))
    A(p('Num sistema ingénuo, o saldo de um utilizador é um número guardado numa tabela e '
        'actualizado com <font face="Courier" size="8.4">UPDATE saldo = saldo - 100</font>. '
        'Esse desenho falha silenciosamente: um erro, uma repetição de pedido ou uma '
        'corrida entre dois processos deixa o dinheiro a existir ou a faltar sem que '
        'ninguém saiba. No PayInter, <b>o saldo nunca é alterado directamente</b>.'))
    A(h2('4.1. Princípios aplicados'))
    X(bullets([
        '<b>Toda a movimentação de valor é uma transacção contabilística.</b> Cada operação '
        'gera um registo em <font face="Courier" size="8.2">ledger_transactions</font> e um '
        'conjunto de movimentos em <font face="Courier" size="8.2">ledger_entries</font>, '
        'cada um com débito ou crédito.',
        '<b>O total dos débitos iguala o total dos créditos.</b> Esta igualdade é a '
        'invariante do sistema: se se quebrar, há um erro detectável.',
        '<b>Os saldos visíveis são uma cache derivada.</b> A tabela de saldos existe por '
        'desempenho, mas pode ser reconstruída a partir do livro-razão a qualquer momento.',
        '<b>Existe verificação automática de consistência.</b> O serviço de reconciliação '
        'compara a cache com a soma das entradas e sinaliza divergências.',
        '<b>Cada movimento guarda o saldo resultante.</b> O campo '
        '<font face="Courier" size="8.2">balance_after_minor</font> permite auditar o '
        'histórico sem recalcular nada.',
    ]))
    A(Spacer(1, 5))
    A(h2('4.2. Estrutura de contas'))
    A(p('As contas seguem uma convenção de nomenclatura que identifica o proprietário e a '
        'divisa, e que separa as contas de utilizador das contas do sistema:'))
    A(T([
        ['Padrão de conta', 'Tipo', 'Significado'],
        ['WALLET:{userId}:{DIVISA}', 'Utilizador', 'Conta individual de cada utilizador por '
                                                   'divisa (ex.: WALLET:u_8f3…:USD)'],
        ['SYS:clearing:{DIVISA}', 'Sistema', 'Conta de compensação — detém o valor '
                                             'durante o processamento'],
        ['SYS:settlement:{DIVISA}', 'Sistema', 'Liquidação com o exterior'],
        ['SYS:revenue:{DIVISA}', 'Sistema', 'Receita de taxas cobradas pela plataforma'],
        ['SYS:suspense:{DIVISA}', 'Sistema', 'Valor retido para revisão manual (disputas, '
                                             'suspeitas de fraude)'],
    ], [W_FULL * 0.36, W_FULL * 0.14, W_FULL * 0.50]))

    A(Spacer(1, 7))
    def draw_ledger(d):
        g = Group()
        w = W_FULL
        y = 62
        box(g, 6, y, w * 0.235, 44, 'Carteira A', 'Utilizador pagador',
            fill=colors.HexColor('#EEF2FF'), stroke=INFO_BD)
        box(g, w * 0.318, y, w * 0.235, 44, 'Compensação', 'SYS:clearing',
            fill=LIGHT, stroke=BORDER)
        box(g, w * 0.63, y, w * 0.235, 44, 'Carteira B', 'Utilizador destinatário',
            fill=colors.HexColor('#EEF2FF'), stroke=INFO_BD)
        arrow(g, w * 0.241, y + 30, w * 0.316, y + 30, col=ACCENT_D, head=3.6)
        arrow(g, w * 0.553, y + 30, w * 0.628, y + 30, col=ACCENT_D, head=3.6)
        d.add(String(w * 0.276, y + 34, 'DÉBITO', fontName='Helvetica-Bold', fontSize=6.4,
                     fillColor=colors.HexColor('#B91C1C'), textAnchor='middle'))
        d.add(String(w * 0.276, y + 24, 'CRÉDITO', fontName='Helvetica-Bold', fontSize=6.4,
                     fillColor=OK, textAnchor='middle'))
        d.add(String(w * 0.588, y + 34, 'DÉBITO', fontName='Helvetica-Bold', fontSize=6.4,
                     fillColor=OK, textAnchor='middle'))
        d.add(String(w * 0.588, y + 24, 'CRÉDITO', fontName='Helvetica-Bold', fontSize=6.4,
                     fillColor=colors.HexColor('#B91C1C'), textAnchor='middle'))
        box(g, 6, 10, w - 12, 34,
            'Invariante:  Σ débitos  =  Σ créditos        |        Taxa retida → SYS:revenue',
            fill=colors.HexColor('#F0FDF4'), stroke=colors.HexColor('#86EFAC'),
            font='Helvetica-Bold', fs=7.6)
        d.add(g)

    A(diagram(draw_ledger, W_FULL, 118))
    A(Spacer(1, 3))
    A(caption('Figura 2 — Percurso do valor numa transferência entre utilizadores. Cada '
              'movimento tem uma contrapartida; a soma dos débitos iguala sempre a soma '
              'dos créditos.', W_FULL))

    A(Spacer(1, 6))
    A(h2('4.3. Garantias de implementação'))
    X(bullets([
        '<b>Operações atómicas.</b> A transacção contabilística e todos os seus movimentos '
        'são escritos dentro de uma única transacção de base de dados: ou ficam todos, ou '
        'não fica nenhum.',
        '<b>Pedidos repetidos não duplicam dinheiro.</b> Cada pedido de movimentação carrega '
        'uma chave de idempotência (<font face="Courier" size="8.2">Idempotency-Key</font>); '
        'a repetição devolve o resultado original em vez de cobrar duas vezes.',
        '<b>Reconciliação sob pedido.</b> O serviço compara cada saldo em cache com o '
        'somatório do livro-razão, detecta transacções cujos totais não batem certo e '
        'devolve um relatório com os problemas encontrados.',
        '<b>Reconstrução possível.</b> Como o livro-razão é a fonte de verdade, é sempre '
        'possível reconstruir os saldos e verificar toda a história financeira.',
    ]))

    # ---- 5. Modelo de dados
    A(PageBreak())
    A(h1('5. Modelo de Dados'))
    A(p('A base de dados tem 25 tabelas, organizadas por domínio funcional. O esquema é '
        'versionado em três migrações SQL, aplicadas automaticamente na primeira execução, '
        'pelo que não existe passos manuais de instalação.'))
    A(T([
        ['Domínio', 'Tabelas', 'Finalidade'],
        ['Identidade e acesso', 'users · user_sessions · otp_codes · admin_users · security_events',
         'Contas, sessões activas, códigos de uso único, operadores e registo de eventos de segurança'],
        ['Livro-razão', 'ledger_accounts · ledger_transactions · ledger_entries',
         'O núcleo financeiro: contas, transacções contabilísticas e movimentos de débito/crédito'],
        ['Saldos e carteiras', 'wallets · wallet_balances',
         'Carteira por utilizador e cache de saldos (derivada do livro-razão)'],
        ['Movimentos', 'transactions · idempotency_keys',
         'Registo funcional dos movimentos com estado, e chaves que impedem duplicação'],
        ['Pagamentos e cartões', 'payment_cards · recipients',
         'Cartões virtuais, destinatários frequentes e dados de envio'],
        ['Câmbios e taxas', 'currencies · fx_rates · fee_rules · provider_configs',
         'Divisas suportadas, taxas de câmbio, regras de comissão e configuração de fornecedores'],
        ['Cumprimento e risco', 'kyc_submissions · fraud_alerts',
         'Processos de verificação de identidade e alertas automáticos de fraude'],
        ['Comunicação e apoio', 'notifications · notification_prefs · support_tickets · support_messages',
         'Notificações, preferências do utilizador e sistema de apoio ao cliente'],
        ['Auditoria', 'audit_logs',
         'Registo imutável de acções sensíveis: administração e operações com dinheiro'],
    ], [W_FULL * 0.20, W_FULL * 0.34, W_FULL * 0.46]))
    A(Spacer(1, 7))
    A(Callout('Integridade referencial e limites',
              'As tabelas usam chaves estrangeiras, restrições de verificação e índices '
              'parciais (por exemplo, sobre movimentos em estado pendente). Os valores '
              'monetários são guardados como <b>inteiros na unidade mínima</b> da divisa '
              '(cêntimos), nunca como números decimais — o que elimina os erros de '
              'arredondamento típicos de cálculos com vírgula flutuante.', kind='info'))

    # ---- 6. Segurança
    A(PageBreak())
    A(h1('6. Segurança e Autenticação'))
    A(p('A segurança é tratada em profundidade, em várias camadas independentes. Nenhuma '
        'delas é suficiente por si só; em conjunto, tornam o acesso indevido e a '
        'duplicação de operações substancialmente mais difíceis.'))
    A(h2('6.1. Autenticação'))
    A(T([
        ['Mecanismo', 'Implementação'],
        ['Palavra-passe', 'Guardada com bcrypt (algoritmo de derivação lento e com sal). '
                          'A palavra-passe original nunca é armazenada nem registada.'],
        ['PIN da aplicação', 'Derivado com bcrypt e reforçado com um "pepper" secreto '
                             'guardado fora da base de dados, de modo a que a fuga da base '
                             'de dados, por si só, não exponha os PINs.'],
        ['Sessão de acesso', 'Token JWT assinado, válido por 15 minutos.'],
        ['Sessão de renovação', 'Token aleatório de 48 bytes, válido por 30 dias, guardado '
                                'apenas como resumo criptográfico (SHA-256). É <b>rodado a '
                                'cada renovação</b>: um token usado nunca volta a ser aceite.'],
        ['Revogação', 'Encerramento de sessão e listagem de dispositivos activos com '
                      'possibilidade de revogação individual.'],
        ['Código de uso único (OTP)', '6 dígitos, associados ao utilizador, válidos por 10 '
                                      'minutos, com máximo de 5 tentativas e guardados '
                                      'apenas como resumo.'],
        ['Limites de pedidos', 'Autenticação: 20 pedidos por minuto por origem. OTP: 5 '
                               'pedidos por minuto por origem e conta.'],
    ], [W_FULL * 0.26, W_FULL * 0.74]))
    A(Spacer(1, 6))
    A(h2('6.2. Autorização e controlo de operações'))
    X(bullets([
        '<b>Perfis de acesso aplicados no servidor.</b> As permissões dos operadores são '
        'verificadas em cada pedido, no servidor. Ocultar botões no cliente não é tratado '
        'como medida de segurança.',
        '<b>Registo de auditoria.</b> As acções sensíveis — administração, ajustes, '
        'reembolsos, alterações de estado — ficam registadas com autor, data e detalhe.',
        '<b>Validação de todas as entradas.</b> Os pedidos são validados contra esquemas '
        'formais (zod) antes de chegarem à lógica de negócio.',
        '<b>Cabeçalhos de segurança.</b> Aplicados por omissão através do Helmet, com '
        'lista de origens permitidas para pedidos entre domínios.',
        '<b>Segredos fora do código.</b> Chaves, senhas e credenciais são lidas apenas de '
        'variáveis de ambiente. O repositório contém ficheiros de exemplo sem valores '
        'reais.',
        '<b>Deteccão de fraude.</b> Regras automáticas sinalizam montantes elevados e '
        'frequência anómala de operações, colocando-as em fila de revisão manual em vez de '
        'as executar cegamente.',
    ]))
    A(Spacer(1, 6))
    A(Callout('Antes de qualquer utilização com fundos reais',
              'A configuração de produção exige substituir todas as chaves de exemplo, '
              'activar HTTPS obrigatório, ligar um serviço real de gestão de segredos, '
              'definir retenção e cópia de segurança da base de dados, e obter parecer '
              'jurídico sobre o enquadramento aplicável. O estado actual é adequado a '
              'demonstração e avaliação técnica, não a operação com dinheiro real.',
              kind='warn'))

    # ---- 7. API
    A(PageBreak())
    A(h1('7. Interface de Programação (API REST)'))
    A(p('A API expõe 95 endpoints organizados por domínio, todos sob o prefixo '
        '<font face="Courier" size="8.4">/v1</font>. A autenticação é feita por token '
        'Bearer no cabeçalho do pedido. As respostas de erro seguem um formato único, o '
        'que simplifica o tratamento no cliente.'))
    A(h2('7.1. Grupos de endpoints'))
    A(T([
        ['Grupo', 'Prefixo', 'Endpoints', 'Destaques'],
        ['Autenticação', '/v1/auth', '12', 'registo, sessão, renovação, PIN, OTP, sessões activas'],
        ['Carteira', '/v1/wallet', '1', 'saldos consolidados por divisa'],
        ['Utilizadores', '/v1/users', '1', 'pesquisa por PayTag para envio entre utilizadores'],
        ['Transferências', '/v1/transfers', '1', 'envio entre utilizadores com taxa'],
        ['Movimentos', '/v1/transactions', '3', 'extracto, detalhe e abertura de disputa'],
        ['Pagamentos', '/v1/payments', '4', 'carregamento, banco e carteira móvel'],
        ['Carregamentos', '/v1/topups', '2', 'cotação e execução'],
        ['Cartões', '/v1/cards', '5', 'emissão, congelar, descongelar, predefinido'],
        ['Internacional', '/v1/payments/international', '1', 'envio com câmbio'],
        ['Destinatários', '/v1/recipients', '4', 'gestão de contactos de envio'],
        ['Códigos QR', '/v1/qr', '3', 'gerar, resolver e pagar'],
        ['Verificação (KYC)', '/v1/kyc', '2', 'submissão e estado'],
        ['Câmbios', '/v1/fx', '2', 'taxas e cotação'],
        ['Notificações', '/v1/notifications', '5', 'lista, leitura e preferências'],
        ['Apoio', '/v1/support', '5', 'pedidos, mensagens e FAQ'],
        ['Privacidade', '/v1/privacy', '2', 'exportação de dados e extractos'],
        ['Jurídico', '/v1/legal', '2', 'termos, privacidade e avisos legais'],
        ['Administração', '/v1/admin', '38', 'painel de operações, revisões, risco, taxas e auditoria'],
        ['Operação técnica', '/ops', '3', 'estado, prontidão e métricas'],
    ], [W_FULL * 0.185, W_FULL * 0.215, W_FULL * 0.115, W_FULL * 0.485]))
    A(Spacer(1, 6))
    A(h2('7.2. Formato de erro'))
    A(p('Todos os erros devolvem a mesma estrutura, com um código estável que o cliente '
        'pode interpretar sem depender do texto da mensagem:'))
    A(code_block(
        '{\n'
        '  "error": {\n'
        '    "code": "INSUFFICIENT_FUNDS",\n'
        '    "message": "Saldo insuficiente para esta operação",\n'
        '    "details": { "availableMinor": 1250, "requiredMinor": 5000 }\n'
        '  }\n'
        '}'))

    # ---- 8. Offline
    A(PageBreak())
    A(h1('8. Aplicação Offline-First'))
    A(p('O cliente foi construído para o cenário real de rede intermitente: em vez de '
        'mostrar um ecrã de erro quando não há ligação, continua a funcionar e sincroniza '
        'depois. Há três mecanismos distintos a cooperar.'))
    A(h2('8.1. Os três mecanismos'))
    A(T([
        ['Mecanismo', 'Como funciona'],
        ['Instalação e arranque', 'Um <i>service worker</i> guarda a estrutura da aplicação '
                                  '(ecrãs, estilos, código) no dispositivo. A aplicação abre '
                                  'instantaneamente e funciona sem rede.'],
        ['Leitura de dados', 'As leituras tentam primeiro a rede. Se falharem, é devolvida a '
                             'última cópia guardada localmente, por utilizador, no '
                             'IndexedDB do navegador. O utilizador vê os seus dados com um '
                             'aviso claro de que podem estar desactualizados.'],
        ['Escrita de dados', 'Uma operação feita sem rede é guardada numa <b>fila de saída '
                             'local</b>, com uma chave de idempotência própria. O interface '
                             'mostra-a imediatamente como pendente. Quando a ligação '
                             'regressa, a fila é enviada pela ordem original.'],
    ], [W_FULL * 0.24, W_FULL * 0.76]))

    A(Spacer(1, 7))
    def draw_offline(d):
        g = Group()
        w = W_FULL
        # coluna esquerda: leitura
        box(g, 0, 96, w * 0.47, 26, 'Caminho de leitura', fill=colors.HexColor('#EEF2FF'),
            stroke=INFO_BD, fs=8.2)
        box(g, 0, 62, w * 0.47, 26, 'Rede disponível?', fill=LIGHT, stroke=BORDER, fs=8)
        box(g, 0, 28, w * 0.47, 26, 'Cópia local (IndexedDB)', fill=colors.HexColor('#ECFEFF'),
            stroke=CYAN, fs=8)
        box(g, 0, 2, w * 0.47, 20, 'Apresenta com aviso de desactualização', fill=LIGHT2,
            stroke=BORDER, fs=7.4)
        arrow(g, w * 0.235, 96, w * 0.235, 89, col=ACCENT_D, head=3.2)
        arrow(g, w * 0.235, 62, w * 0.235, 55, col=ACCENT_D, head=3.2)
        arrow(g, w * 0.235, 28, w * 0.235, 23, col=ACCENT_D, head=3.2)
        # coluna direita: escrita
        box(g, w * 0.53, 96, w * 0.47, 26, 'Caminho de escrita', fill=colors.HexColor('#FEF2F2'),
            stroke=colors.HexColor('#FCA5A5'), fs=8.2)
        box(g, w * 0.53, 62, w * 0.47, 26, 'Fila de saída + chave de idempotência',
            fill=colors.HexColor('#FFFBEB'), stroke=WARN_BD, fs=7.6)
        box(g, w * 0.53, 28, w * 0.47, 26, 'Reenvio por ordem de criação', fill=LIGHT,
            stroke=BORDER, fs=8)
        box(g, w * 0.53, 2, w * 0.47, 20, 'Servidor reconhece repetições', fill=colors.HexColor('#F0FDF4'),
            stroke=colors.HexColor('#86EFAC'), fs=7.4)
        arrow(g, w * 0.765, 96, w * 0.765, 89, col=ACCENT_D, head=3.2)
        arrow(g, w * 0.765, 62, w * 0.765, 55, col=ACCENT_D, head=3.2)
        arrow(g, w * 0.765, 28, w * 0.765, 23, col=ACCENT_D, head=3.2)
        d.add(g)

    A(diagram(draw_offline, W_FULL, 126))
    A(Spacer(1, 3))
    A(caption('Figura 3 — Os dois caminhos do cliente offline. A chave de idempotência é '
              'o elemento que garante que a sincronização não duplica pagamentos.', W_FULL))

    A(Spacer(1, 6))
    A(h2('8.2. O que garante a correcção do processo'))
    X(bullets([
        '<b>Sem duplicação.</b> Mesmo que a aplicação seja encerrada a meio do reenvio, ou '
        'que o mesmo pedido chegue duas vezes ao servidor, a chave de idempotência garante '
        'uma única execução. Este é o ponto onde aplicações offline costumam falhar, e é '
        'tratado explicitamente.',
        '<b>Ordem preservada.</b> As operações são reenviadas pela ordem em que foram '
        'criadas, evitando que um pagamento posterior seja aplicado antes do anterior.',
        '<b>Estado visível.</b> O utilizador vê sempre o que está pendente, o que falhou e '
        'o motivo da rejeição.',
        '<b>Fila limitada.</b> As operações com erro definitivo (por exemplo, saldo '
        'insuficiente) são retiradas da fila com explicação, em vez de a bloquearem.',
    ]))

    # ---- 9. Stack
    A(PageBreak())
    A(h1('9. Stack Tecnológico'))
    A(p('As tecnologias foram escolhidas por maturidade e por facilidade de contratação '
        'em contexto angolano, evitando dependências exóticas de difícil manutenção local.'))
    A(T([
        ['Componente', 'Tecnologia', 'Versão', 'Porquê'],
        ['Servidor', 'Node.js + TypeScript', '≥ 20', 'Uma só linguagem no servidor e no '
                                                      'cliente; tipos verificados em compilação'],
        ['Framework HTTP', 'Express', '4.21', 'Maduro, documentado, fácil de manter'],
        ['Validação', 'zod', '3.23', 'Validação formal das entradas dos pedidos'],
        ['Base de dados', 'PostgreSQL', '16', 'Integridade transaccional e consultas fiáveis'],
        ['Base de dados (desenvolvimento)', 'PGlite', '0.2', 'PostgreSQL embedding em memória — permite '
                                                            'arrancar e testar sem instalar nada'],
        ['Palavras-passe e PINs', 'bcryptjs', '2.4', 'Derivação lenta resistente a ataques por '
                                                      'força bruta'],
        ['Sessões', 'jsonwebtoken', '9.0', 'Tokens de acesso assinados'],
        ['Interface', 'React', '18.3', 'Ecossistema estável e ampla base de programadores'],
        ['Construção', 'Vite', '5.4', 'Compilação rápida e empacotamento em PWA'],
        ['Aplicação instalável', 'vite-plugin-pwa + Workbox', '0.21 / 7.3', 'Instalação e '
                                                                            'funcionamento offline'],
        ['Empacotamento Android', 'Capacitor', '6.2', 'Gera o APK a partir do mesmo código do cliente'],
        ['Testes', 'Vitest', '2.1', 'Testes unitários e de integração sobre a API real'],
    ], [W_FULL * 0.20, W_FULL * 0.20, W_FULL * 0.11, W_FULL * 0.49]))

    # ---- 10. Testes
    A(Spacer(1, 8))
    A(h1('10. Qualidade e Testes Automatizados'))
    A(p('Existem 34 testes automatizados, distribuídos por cinco áreas, e todos passam no '
        'estado actual do código. Os testes correm contra uma base de dados PostgreSQL '
        'real criada em memória, e não contra simulações, o que aumenta '
        'significativamente a sua capacidade de detectar problemas reais.'))
    A(T([
        ['Ficheiro de teste', 'Testes', 'Cobertura'],
        ['tests/ledger.test.ts', '5', 'Livro-razão: equilíbrio de débitos e créditos, '
                                      'saldos, reconciliação, taxas'],
        ['tests/payments.test.ts', '9', 'Pagamentos, carregamentos, transferências e '
                                         'tratamento de saldo insuficiente'],
        ['tests/auth.test.ts', '6', 'Registo, sessão, renovação de token, PIN e códigos de uso único'],
        ['tests/admin.test.ts', '8', 'Permissões de operador, revisões de KYC, reembolsos e auditoria'],
        ['tests/qr_intl.test.ts', '6', 'Códigos QR assinados e transferências internacionais'],
        ['Total', '34', '100% a passar'],
    ], [W_FULL * 0.26, W_FULL * 0.10, W_FULL * 0.64]))

    # ---- 11. Limitações
    A(PageBreak())
    A(h1('11. Limitações Conhecidas e Transparência Técnica'))
    A(p('Um documento técnico honesto deve declarar o que <b>não</b> está feito. Os pontos '
        'seguintes são limitações reais do estado actual do projecto e devem ser '
        'considerados em qualquer decisão:'))
    A(T([
        ['Ponto', 'Situação real', 'Impacto'],
        ['Ambiente de demonstração',
         'Por omissão, todos os fornecedores são simulados: cartões, câmbios, KYC e '
         'transferências internacionais.',
         'Nenhum valor real é movimentado. É adequado para demonstração e avaliação, não '
         'para operação real.'],
        ['Licenciamento',
         'O projecto não possui licença de instituição financeira ou de prestador de '
         'serviços de pagamento.',
         'Bloqueia por completo qualquer utilização com fundos reais. Requer enquadramento '
         'junto do regulador competente.'],
        ['Consola de operações',
         'A API administrativa está implementada (38 endpoints), mas a interface web para '
         'operadores não está incluída no repositório.',
         'A gestão de utilizadores, revisões e risco é feita por chamada directa à API.'],
        ['Documentação de referência',
         'O ficheiro de apresentação do repositório menciona uma pasta de consola de '
         'administração, documentação de arquitectura e ficheiros de orquestração de '
         'contentores que ainda não existem no código.',
         'Divergência entre a descrição e o conteúdo real. Este dossier reflecte o estado '
         'efectivo do código.'],
        ['Número de testes',
         'A apresentação do repositório refere 52 testes; o código contém 34.',
         'Discrepância documental, sem impacto funcional, mas relevante para avaliação técnica.'],
        ['Distribuição Android',
         'O processo automático de geração do APK está preparado, mas ainda não foi '
         'executado com sucesso nenhuma vez.',
         'O APK ainda não existe como artefacto verificável.'],
        ['Segurança em produção',
         'Chaves de exemplo, ausência de gestor de segredos, cópias de segurança e '
         'monitorização não configuradas.',
         'Requer trabalho antes de qualquer exposição a tráfego real.'],
    ], [W_FULL * 0.20, W_FULL * 0.44, W_FULL * 0.36]))
    A(Spacer(1, 7))
    A(Callout('Recomendação da Makina Company',
              'Recomendamos apresentar o PayInter como <b>prova de conceito técnica '
              'avançada</b> e não como produto em operação. É um activo real e demonstrável: '
              'o livro-razão, o modelo offline e a API são trabalho efectivo e verificável. '
              'A linguagem de comunicação deve acompanhar essa realidade — a credibilidade '
              'técnica é precisamente o argumento mais forte deste projecto.', kind='info'))

    # ---- 12. Configuração
    A(PageBreak())
    A(h1('12. Configuração e Instalação'))
    A(p('O sistema arranca sem infraestrutura externa: a base de dados é criada em memória, '
        'as migrações e os dados de demonstração são aplicados automaticamente. Isto '
        'permite demonstrar o sistema completo a partir de um único comando.'))
    A(h2('12.1. Arranque em três passos'))
    A(code_block(
        '# 1. Servidor de aplicação (cria base de dados, migrações e dados de demonstração)\n'
        'cd backend  &&  npm install  &&  npm run dev\n'
        '   → http://localhost:4000/ops/health\n'
        '\n'
        '# 2. Aplicação cliente (PWA instalável)\n'
        'cd mobile   &&  npm install  &&  npm run dev\n'
        '   → http://localhost:5173\n'
        '\n'
        '# 3. Verificação automática\n'
        'cd backend  &&  npm test              # 34 testes', dark=True))
    A(Spacer(1, 7))
    A(h2('12.2. Credenciais de demonstração'))
    A(T([
        ['Contexto', 'Utilizador', 'Palavra-passe', 'Extras'],
        ['Aplicação cliente', 'demo@payinter.app', 'Demo1234!', 'PIN 2468 · código OTP 123456'],
        ['Administração', 'admin@payinter.app', 'Admin1234!', 'Perfil de superadministrador'],
    ], [W_FULL * 0.22, W_FULL * 0.28, W_FULL * 0.20, W_FULL * 0.30]))
    A(Spacer(1, 7))
    A(h2('12.3. Cartões de teste (simulados)'))
    A(T([
        ['Número do cartão', 'Comportamento esperado'],
        ['4242 4242 4242 4242', 'Pagamento aceite'],
        ['4000 0000 0000 9995', 'Pagamento recusado'],
        ['4000 0025 0000 3155', 'Requer confirmação adicional (3-D Secure)'],
    ], [W_FULL * 0.38, W_FULL * 0.62]))
    A(Spacer(1, 7))
    A(h2('12.4. Principais variáveis de configuração'))
    A(p('Todas as credenciais são lidas de variáveis de ambiente; o repositório contém '
        'apenas ficheiros de exemplo sem valores reais.', style='body_sm'))
    A(T([
        ['Variável', 'Função'],
        ['NODE_ENV / PORT', 'Ambiente de execução e porta do servidor'],
        ['DEMO_MODE / SANDBOX_PROVIDERS', 'Activa o modo demonstração e os fornecedores simulados'],
        ['DATABASE_URL / DB_EMBEDDED', 'Ligação a PostgreSQL ou uso da base de dados em memória'],
        ['JWT_SECRET / JWT_REFRESH_SECRET', 'Chaves de assinatura das sessões'],
        ['PIN_PEPPER / QR_SIGNING_SECRET', 'Reforço do PIN e assinatura dos códigos QR'],
        ['ACCESS_TOKEN_TTL_SECONDS', 'Validade do token de acesso (por omissão, 900 s)'],
        ['OTP_TTL_SECONDS / OTP_MAX_ATTEMPTS', 'Validade e tentativas dos códigos de uso único'],
        ['FRAUD_LARGE_AMOUNT_MINOR', 'Limite a partir do qual um movimento é sinalizado'],
        ['CORS_ORIGINS', 'Origens autorizadas a comunicar com a API'],
    ], [W_FULL * 0.38, W_FULL * 0.62]))

    # ---- 13. Contactos
    A(PageBreak())
    A(h1('13. Identificação da Empresa Emitente'))
    A(p('Este documento foi preparado e emitido pela ' + COMPANY + ', como parte da '
        'avaliação técnica e da preparação de apresentação da aplicação PayInter.'))
    A(Spacer(1, 4))
    A(T([
        ['Campo', 'Valor'],
        ['Empresa', COMPANY],
        ['Documento', 'Dossier Técnico da Aplicação PayInter'],
        ['Versão do documento', '1.0'],
        ['Data de emissão', 'Outubro de 2026'],
        ['Estado do software', 'Prova de conceito — ambiente de demonstração (sandbox)'],
        ['Responsável técnico', '[NOME DO RESPONSÁVEL]'],
        ['Endereço', '[ENDEREÇO], [CIDADE], [PAÍS]'],
        ['Contacto telefónico', '[TELEFONE]'],
        ['Correio electrónico', '[EMAIL]'],
        ['Sítio na Internet', '[SITE]'],
        ['Identificação fiscal', '[NIF]'],
        ['Registo comercial', '[REGISTO COMERCIAL]'],
    ], [W_FULL * 0.34, W_FULL * 0.66]))
    A(Spacer(1, 10))
    A(Callout('Nota sobre os dados em falta',
              'Os campos indicados entre parênteses rectos estão deliberadamente por '
              'preencher. Devem ser substituídos pelos dados oficiais da empresa antes de '
              'qualquer divulgação externa, impressão ou envio a terceiros.', kind='warn'))
    A(Spacer(1, 22))
    A(HRule(thickness=0.6, color=BORDER))
    A(Spacer(1, 6))
    A(p('<font size="7.6" color="#64748B">Documento confidencial. A informação técnica '
        'aqui descrita foi extraída directamente do código-fonte do projecto PayInter no '
        'estado em que se encontrava à data de emissão. O sistema funciona, por omissão, '
        'em ambiente de demonstração e não movimenta fundos reais nem se apresenta como '
        'entidade licenciada.</font>'))

    # ================================================================ PARTE II
    A(PageBreak())
    X(part_divider('PART II — ENGLISH',
                   'Technical documentation of the PayInter application, issued by '
                   + COMPANY + ' as part of the evaluation process.'))

    A(h1('1. Executive Summary'))
    A(p('<b>PayInter</b> is an international payments and multi-currency wallet '
        'application built as an <b>industrial-grade proof of concept</b>: the codebase is '
        'not a screen prototype but a system with a double-entry financial ledger, '
        'password and PIN authentication, role-based access control, an audit trail, and a '
        'client application that keeps working without an Internet connection.'))
    A(p('The application is split into three independent components: a <b>REST API</b> in '
        'Node.js and TypeScript, a <b>relational database</b> (PostgreSQL) with versioned '
        'migrations, and an installable <b>client application</b> (PWA) that can be '
        'packaged as an Android application (APK) through Capacitor.'))
    A(Spacer(1, 4))
    A(T([
        ['Metric', 'Value', 'Note'],
        ['REST endpoints implemented', '95', 'Across 18 route groups'],
        ['Database tables', '25', 'Versioned SQL migrations'],
        ['Backend lines of code', '≈ 6,100', 'Routes, services, libraries, middleware'],
        ['Client lines of code', '≈ 2,830', '17 screens, offline synchronisation'],
        ['Automated tests', '34', '5 test files — all passing'],
        ['Client distribution', 'PWA + APK', 'Android packaging via Capacitor'],
    ], [W_FULL * 0.42, W_FULL * 0.16, W_FULL * 0.42]))
    A(Spacer(1, 8))
    A(Callout('Essential notice — demonstration environment',
              'PayInter is configured by default as a <b>sandbox</b>. It does not move real '
              'money, does not charge real cards, and <b>holds no financial institution '
              'licence</b>. All providers — card processing, foreign exchange, identity '
              'verification (KYC) and international transfers — are <b>simulated</b>. Any '
              'use with real funds requires licensing, provider contracts and prior legal '
              'advice. See chapter 11.', kind='warn'))

    A(h1('2. System Architecture'))
    A(p('The architecture follows a strict layer separation. The client never writes to the '
        'database directly: every mutation goes through a validated endpoint, then through '
        'a domain service, and only then through the ledger.'))
    A(T([
        ['Layer', 'Responsibility'],
        ['Client (PWA / APK)', '17 React screens, session handling, offline cache and local outbox'],
        ['API (Express + TypeScript)', 'Request validation, authentication, authorisation, rate '
                                       'limiting, idempotency'],
        ['Domain services', 'Ledger postings, fees, FX quotes, fraud rules, audit logging'],
        ['Data layer', 'PostgreSQL 16 (production) or PGlite in-memory (development and tests)'],
        ['Providers', 'Simulated in sandbox: card processor, FX feed, KYC and payouts'],
        ['Observability', '/ops/health, /ops/ready and /ops/metrics endpoints'],
    ], [W_FULL * 0.30, W_FULL * 0.70]))

    A(h1('3. Financial Model — Double-Entry Ledger'))
    A(p('This is the most important technical decision in the project and the clearest '
        'distinction between PayInter and a simple payments mock-up.'))
    A(p('In a naive system, a user balance is a stored number updated with '
        '<font face="Courier" size="8.4">UPDATE balance = balance - 100</font>. That design '
        'fails silently: an error, a retried request or a race between two processes leaves '
        'money appearing or vanishing with nobody aware. In PayInter, <b>a balance is never '
        'mutated directly</b>.'))
    X(bullets([
        '<b>Every value movement is an accounting transaction.</b> Each operation creates a '
        'record in <font face="Courier" size="8.2">ledger_transactions</font> plus a set of '
        'legs in <font face="Courier" size="8.2">ledger_entries</font>, each a debit or a credit.',
        '<b>Total debits always equal total credits.</b> This equality is the system '
        'invariant: if it breaks, an error is detectable.',
        '<b>Visible balances are a derived cache.</b> The balance table exists for '
        'performance but can be rebuilt from the ledger at any time.',
        '<b>Consistency is checked automatically.</b> A reconciliation service compares the '
        'cache against the sum of ledger entries and reports any divergence.',
        '<b>Every leg stores the resulting balance.</b> The '
        '<font face="Courier" size="8.2">balance_after_minor</font> field allows historical '
        'auditing without recomputation.',
    ]))
    A(Spacer(1, 4))
    A(T([
        ['Account pattern', 'Type', 'Meaning'],
        ['WALLET:{userId}:{CCY}', 'User', 'Per-user account for each currency'],
        ['SYS:clearing:{CCY}', 'System', 'Clearing account holding value while processing'],
        ['SYS:settlement:{CCY}', 'System', 'Settlement with the outside world'],
        ['SYS:revenue:{CCY}', 'System', 'Platform fee revenue'],
        ['SYS:suspense:{CCY}', 'System', 'Value held for manual review (disputes, fraud suspicion)'],
    ], [W_FULL * 0.36, W_FULL * 0.14, W_FULL * 0.50]))
    A(Spacer(1, 5))
    A(Callout('Correctness guarantees in the implementation',
              '<b>Atomicity:</b> a ledger transaction and all its legs are written inside a '
              'single database transaction — all or nothing. <b>No double spending on '
              'retries:</b> every mutation carries an Idempotency-Key; a repeat returns the '
              'original result instead of charging twice. <b>Reconstructible:</b> since the '
              'ledger is the source of truth, balances and full financial history can always '
              'be rebuilt and audited.', kind='info'))

    A(PageBreak())
    A(h1('4. Security and Authentication'))
    A(T([
        ['Mechanism', 'Implementation'],
        ['Password', 'Stored with bcrypt (salted, deliberately slow). The original password is '
                     'never stored or logged.'],
        ['Application PIN', 'bcrypt-derived and strengthened with a secret "pepper" held '
                            'outside the database, so a database leak alone does not expose PINs.'],
        ['Access session', 'Signed JWT, valid for 15 minutes.'],
        ['Refresh session', 'Random 48-byte token, valid for 30 days, stored only as a SHA-256 '
                            'digest. <b>Rotated on every renewal</b>: a used token is never '
                            'accepted again.'],
        ['One-time codes (OTP)', '6 digits, user-bound, 10-minute expiry, maximum 5 attempts, '
                                 'stored only as a digest.'],
        ['Rate limiting', 'Authentication: 20 requests/minute per origin. OTP: 5 requests/minute '
                          'per origin and account.'],
        ['Authorisation', 'Role permissions enforced server-side on every request; hiding client '
                          'buttons is not treated as a security control.'],
        ['Audit trail', 'Sensitive actions — administration, adjustments, refunds, status '
                        'changes — are logged with actor, timestamp and detail.'],
        ['Secrets', 'Read exclusively from environment variables; the repository holds example '
                    'files with no real values.'],
        ['Fraud detection', 'Automatic rules flag large amounts and anomalous transaction '
                            'frequency, routing them to manual review instead of executing blindly.'],
    ], [W_FULL * 0.24, W_FULL * 0.76]))

    A(h1('5. Offline-First Client'))
    A(p('The client is built for the real scenario of intermittent connectivity: instead of '
        'showing an error screen when the network is unavailable, it keeps working and '
        'synchronises afterwards. Three mechanisms cooperate:'))
    A(T([
        ['Mechanism', 'How it works'],
        ['Installation and start-up', 'A service worker caches the application shell (screens, '
                                      'styles, code). The app opens instantly and works offline.'],
        ['Reading data', 'Reads try the network first and fall back to the last locally cached '
                         'copy, per user, in IndexedDB — with a clear staleness warning.'],
        ['Writing data', 'An operation made offline is stored in a local outbox with its own '
                         'idempotency key and shown immediately as pending. When connectivity '
                         'returns, the queue is replayed in original order.'],
    ], [W_FULL * 0.26, W_FULL * 0.74]))
    A(Spacer(1, 4))
    A(p('The idempotency key is the element that guarantees synchronisation never duplicates '
        'a payment — even if the app is closed mid-replay or the same request reaches the '
        'server twice. This is where offline-first applications most commonly fail, and it '
        'is handled explicitly here.'))

    A(h1('6. API Surface'))
    A(p('95 endpoints are exposed under the <font face="Courier" size="8.4">/v1</font> '
        'prefix, authenticated with a Bearer token. Errors share a single stable shape:'))
    A(code_block(
        '{\n'
        '  "error": {\n'
        '    "code": "INSUFFICIENT_FUNDS",\n'
        '    "message": "Insufficient balance for this operation",\n'
        '    "details": { "availableMinor": 1250, "requiredMinor": 5000 }\n'
        '  }\n'
        '}'))
    A(Spacer(1, 5))
    A(T([
        ['Group', 'Prefix', 'Endpoints'],
        ['Authentication', '/v1/auth', '12'],
        ['Wallet and users', '/v1/wallet · /v1/users', '2'],
        ['Transfers and transactions', '/v1/transfers · /v1/transactions', '4'],
        ['Payments and top-ups', '/v1/payments · /v1/topups', '6'],
        ['Cards', '/v1/cards', '5'],
        ['International and recipients', '/v1/payments/international · /v1/recipients', '5'],
        ['QR codes', '/v1/qr', '3'],
        ['KYC, FX and notifications', '/v1/kyc · /v1/fx · /v1/notifications', '9'],
        ['Support, privacy and legal', '/v1/support · /v1/privacy · /v1/legal', '9'],
        ['Administration', '/v1/admin', '38'],
        ['Operations', '/ops', '3'],
    ], [W_FULL * 0.42, W_FULL * 0.42, W_FULL * 0.16]))

    A(PageBreak())
    A(h1('7. Technology Stack'))
    A(T([
        ['Component', 'Technology', 'Version'],
        ['Runtime', 'Node.js + TypeScript', '≥ 20'],
        ['HTTP framework', 'Express', '4.21'],
        ['Validation', 'zod', '3.23'],
        ['Database', 'PostgreSQL', '16'],
        ['Embedded database (dev/tests)', 'PGlite', '0.2'],
        ['Passwords and PINs', 'bcryptjs', '2.4'],
        ['Sessions', 'jsonwebtoken', '9.0'],
        ['UI', 'React', '18.3'],
        ['Build tool', 'Vite', '5.4'],
        ['Installable app / offline', 'vite-plugin-pwa + Workbox', '0.21 / 7.3'],
        ['Android packaging', 'Capacitor', '6.2'],
        ['Testing', 'Vitest', '2.1'],
    ], [W_FULL * 0.42, W_FULL * 0.38, W_FULL * 0.20]))

    A(h1('8. Quality Assurance'))
    A(p('34 automated tests run against a real in-memory PostgreSQL instance rather than '
        'mocks, which substantially increases their ability to catch real defects. All pass '
        'on the current codebase.'))
    A(T([
        ['Test file', 'Tests', 'Coverage'],
        ['tests/ledger.test.ts', '5', 'Ledger balance invariants, balances, reconciliation, fees'],
        ['tests/payments.test.ts', '9', 'Payments, top-ups, transfers, insufficient-funds handling'],
        ['tests/auth.test.ts', '6', 'Registration, sessions, token renewal, PIN, OTP'],
        ['tests/admin.test.ts', '8', 'Operator permissions, KYC review, refunds, audit logging'],
        ['tests/qr_intl.test.ts', '6', 'Signed QR codes and international transfers'],
        ['Total', '34', 'All passing'],
    ], [W_FULL * 0.30, W_FULL * 0.10, W_FULL * 0.60]))

    A(h1('9. Known Limitations and Technical Transparency'))
    A(p('An honest technical document must state what is <b>not</b> finished. The following '
        'are real limitations of the current state of the project:'))
    A(T([
        ['Item', 'Actual situation', 'Impact'],
        ['Demonstration environment', 'All providers are simulated by default: cards, FX, KYC '
                                      'and international transfers.', 'No real value moves. '
                                      'Suitable for demonstration and technical evaluation, not '
                                      'for live operation.'],
        ['Licensing', 'The project holds no financial institution or payment service provider '
                      'licence.', 'Completely blocks any use with real funds; requires '
                      'engagement with the competent regulator.'],
        ['Operations console', 'The administrative API is implemented (38 endpoints) but the '
                               'operator web interface is not included in the repository.',
         'User management, reviews and risk are handled through direct API calls.'],
        ['Reference documentation', 'The repository presentation mentions an administration '
                                    'console folder, architecture documentation and container '
                                    'orchestration files that do not yet exist in the code.',
         'Divergence between the description and the actual content. This dossier reflects the '
         'effective state of the code.'],
        ['Test count', 'The repository presentation states 52 tests; the code contains 34.',
         'Documentation discrepancy with no functional impact, but relevant to technical review.'],
        ['Android distribution', 'The automated APK build pipeline is prepared but has never '
                                 'completed successfully.', 'No APK exists yet as a verifiable '
                                 'artefact.'],
        ['Production security', 'Example keys, no secrets manager, no backups and no monitoring.',
         'Work required before any exposure to real traffic.'],
    ], [W_FULL * 0.20, W_FULL * 0.44, W_FULL * 0.36]))
    A(Spacer(1, 6))
    A(Callout('Recommendation',
              'We recommend presenting PayInter as an <b>advanced technical proof of '
              'concept</b> rather than a live product. It is a real, demonstrable asset: the '
              'ledger, the offline model and the API are genuine, verifiable engineering. '
              'Communication should match that reality — technical credibility is precisely '
              'this project\u2019s strongest argument.', kind='info'))

    A(h1('10. Company Identification'))
    A(p('This document was prepared and issued by ' + COMPANY + ' as part of the technical '
        'evaluation and presentation preparation for the PayInter application.'))
    A(T([
        ['Field', 'Value'],
        ['Company', COMPANY],
        ['Document', 'PayInter Application — Technical Dossier'],
        ['Document version', '1.0'],
        ['Issue date', 'October 2026'],
        ['Software status', 'Proof of concept — demonstration (sandbox) environment'],
        ['Technical lead', '[NAME]'],
        ['Address', '[ADDRESS], [CITY], [COUNTRY]'],
        ['Phone', '[PHONE]'],
        ['Email', '[EMAIL]'],
        ['Website', '[WEBSITE]'],
        ['Tax identification', '[TAX ID]'],
        ['Commercial registration', '[COMMERCIAL REGISTRATION]'],
    ], [W_FULL * 0.34, W_FULL * 0.66]))
    A(Spacer(1, 12))
    A(HRule(thickness=0.6, color=BORDER))
    A(Spacer(1, 5))
    A(p('<font size="7.6" color="#64748B">Confidential document. All technical information '
        'described here was extracted directly from the PayInter source code as it stood on '
        'the issue date. The system operates by default in a demonstration environment; it '
        'does not move real funds and does not present itself as a licensed entity.</font>'))
    return st


# ----------------------------------------------------------------------------
def main():
    out = 'Dossier_Tecnico_PayInter_Makina_Company.pdf'
    doc = Dossier(out, pagesize=A4, title=f'{DOC_TITLE} — {DOC_SUB} — {COMPANY}',
                  author=COMPANY, subject=DOC_SUB, creator=COMPANY,
                  leftMargin=20 * mm, rightMargin=20 * mm,
                  topMargin=20 * mm, bottomMargin=20 * mm)
    doc.multiBuild(build_story())
    print(f'OK -> {out}')


if __name__ == '__main__':
    main()
