#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera o Manual de Apoio ao Concurso Público do MINSA — Secretário Clínico."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, Color, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, ListFlowable, ListItem, Flowable, CondPageBreak,
)
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import os

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(BASE), "Manual_Apoio_Secretario_Clinico_MINSA.pdf")

pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuBold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSerif", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSerifBold", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"))

GREEN = HexColor("#0B6B3A")
GREEN_D = HexColor("#063F22")
GREEN_L = HexColor("#E6F3EB")
GOLD = HexColor("#C9A227")
RED = HexColor("#C8102E")
CREAM = HexColor("#F6F1E4")
INK = HexColor("#1C1C1C")
MUTED = HexColor("#4A5560")
LINE = HexColor("#D5D8DC")
BOX_BG = HexColor("#F4F7F5")
AMBER_BG = HexColor("#FFF6E0")
RED_BG = HexColor("#FDECEC")
BLUE_BG = HexColor("#EAF2F8")

W, H = A4


class HRule(Flowable):
    def __init__(self, color=GOLD, thickness=1.2, space=4):
        Flowable.__init__(self)
        self.color = color
        self.thickness = thickness
        self.space = space
        self.width = 160 * mm
        self.height = thickness + space

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.height

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.space / 2, self.width, self.space / 2)


class ColorBar(Flowable):
    def __init__(self, height=6):
        Flowable.__init__(self)
        self.h = height

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.h

    def draw(self):
        w = self.width
        self.canv.setFillColor(RED)
        self.canv.rect(0, 0, w * 0.25, self.h, stroke=0, fill=1)
        self.canv.setFillColor(GOLD)
        self.canv.rect(w * 0.25, 0, w * 0.15, self.h, stroke=0, fill=1)
        self.canv.setFillColor(GREEN)
        self.canv.rect(w * 0.40, 0, w * 0.60, self.h, stroke=0, fill=1)


class Callout(Flowable):
    def __init__(self, title, body, styles, kind="memo"):
        Flowable.__init__(self)
        self.title = title
        self.body = body
        self.styles = styles
        self.kind = kind
        self._inner = None

    def _palette(self):
        if self.kind == "dica":
            return GOLD, AMBER_BG
        if self.kind == "atencao":
            return RED, RED_BG
        if self.kind == "lei":
            return HexColor("#1A5276"), BLUE_BG
        return GREEN, GREEN_L

    def wrap(self, aw, ah):
        bar, bg = self._palette()
        inner_w = aw - 10 * mm
        data = [
            [Paragraph(f"<b>{self.title}</b>", self.styles["callout_title"])],
            [Paragraph(self.body, self.styles["callout_body"])],
        ]
        t = Table(data, colWidths=[inner_w])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (0, 0), 6),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
            ("TOPPADDING", (0, 1), (-1, 1), 2),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        self._inner = t
        w, h = t.wrap(inner_w, ah)
        self.width = aw
        self.height = h + 2
        self._bar = bar
        return aw, self.height

    def draw(self):
        self._inner.drawOn(self.canv, 4 * mm, 0)
        self.canv.setFillColor(self._bar)
        self.canv.rect(0, 0, 2.2 * mm, self.height, stroke=0, fill=1)


class QBox(Flowable):
    def __init__(self, num, enunciado, opcoes, styles):
        Flowable.__init__(self)
        self.num = num
        self.enunciado = enunciado
        self.opcoes = opcoes
        self.styles = styles
        self._t = None

    def wrap(self, aw, ah):
        rows = [[Paragraph(f"<b>{self.num}.</b> {self.enunciado}", self.styles["q_enun"])]]
        for letra, txt in self.opcoes:
            rows.append([Paragraph(f"<b>{letra})</b>  {txt}", self.styles["q_opt"])])
        t = Table(rows, colWidths=[aw - 2 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BOX_BG),
            ("BOX", (0, 0), (-1, -1), 0.4, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (0, 0), 6),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
            ("TOPPADDING", (0, 1), (-1, -1), 1),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        self._t = t
        w, h = t.wrap(aw, ah)
        self.width, self.height = aw, h
        return aw, h

    def draw(self):
        self._t.drawOn(self.canv, 0, 0)


def styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle(
        "cover_kicker", fontName="DejaVuBold", fontSize=9, leading=12,
        textColor=GOLD, alignment=TA_CENTER, tracking=1.2,
    ))
    ss.add(ParagraphStyle(
        "cover_title", fontName="DejaVuBold", fontSize=26, leading=31,
        textColor=white, alignment=TA_CENTER, spaceAfter=6,
    ))
    ss.add(ParagraphStyle(
        "cover_sub", fontName="DejaVu", fontSize=12, leading=16,
        textColor=HexColor("#E8F5EC"), alignment=TA_CENTER,
    ))
    ss.add(ParagraphStyle(
        "mh1", fontName="DejaVuBold", fontSize=15.5, leading=19,
        textColor=GREEN_D, spaceBefore=10, spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        "mh2", fontName="DejaVuBold", fontSize=12.2, leading=15.5,
        textColor=GREEN, spaceBefore=11, spaceAfter=5,
    ))
    ss.add(ParagraphStyle(
        "mh3", fontName="DejaVuBold", fontSize=10.6, leading=13.5,
        textColor=HexColor("#1A5276"), spaceBefore=8, spaceAfter=3,
    ))
    ss.add(ParagraphStyle(
        "mbody", fontName="DejaVu", fontSize=9.4, leading=13.2,
        textColor=INK, alignment=TA_JUSTIFY, spaceAfter=5,
    ))
    ss.add(ParagraphStyle(
        "body_left", fontName="DejaVu", fontSize=9.4, leading=13.2,
        textColor=INK, alignment=TA_LEFT, spaceAfter=3,
    ))
    ss.add(ParagraphStyle(
        "mbullet", fontName="DejaVu", fontSize=9.3, leading=13.0,
        textColor=INK, leftIndent=10, bulletIndent=0, spaceAfter=2,
    ))
    ss.add(ParagraphStyle(
        "small", fontName="DejaVu", fontSize=8.2, leading=11.2,
        textColor=MUTED, alignment=TA_JUSTIFY,
    ))
    ss.add(ParagraphStyle(
        "mcaption", fontName="DejaVuBold", fontSize=8, leading=10,
        textColor=MUTED, alignment=TA_CENTER, spaceBefore=2, spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        "toc_item", fontName="DejaVu", fontSize=10, leading=16,
        textColor=INK,
    ))
    ss.add(ParagraphStyle(
        "mth", fontName="DejaVuBold", fontSize=8.0, leading=10.5,
        textColor=white, alignment=TA_CENTER,
    ))
    ss.add(ParagraphStyle(
        "mtd", fontName="DejaVu", fontSize=7.8, leading=10.4,
        textColor=INK, alignment=TA_LEFT,
    ))
    ss.add(ParagraphStyle(
        "tdc", fontName="DejaVu", fontSize=7.8, leading=10.4,
        textColor=INK, alignment=TA_CENTER,
    ))
    ss.add(ParagraphStyle(
        "tdb", fontName="DejaVuBold", fontSize=7.8, leading=10.4,
        textColor=INK, alignment=TA_LEFT,
    ))
    ss.add(ParagraphStyle(
        "callout_title", fontName="DejaVuBold", fontSize=8.2, leading=11,
        textColor=GREEN_D,
    ))
    ss.add(ParagraphStyle(
        "callout_body", fontName="DejaVu", fontSize=8.6, leading=11.8,
        textColor=INK, alignment=TA_JUSTIFY,
    ))
    ss.add(ParagraphStyle(
        "q_enun", fontName="DejaVu", fontSize=9.0, leading=12.4,
        textColor=INK, alignment=TA_JUSTIFY,
    ))
    ss.add(ParagraphStyle(
        "q_opt", fontName="DejaVu", fontSize=8.7, leading=11.8,
        textColor=INK, leftIndent=8,
    ))
    ss.add(ParagraphStyle(
        "footer_s", fontName="DejaVu", fontSize=7.4, leading=9,
        textColor=MUTED,
    ))
    ss.add(ParagraphStyle(
        "center_ink", fontName="DejaVu", fontSize=9.5, leading=13,
        textColor=INK, alignment=TA_CENTER,
    ))
    ss.add(ParagraphStyle(
        "quote", fontName="DejaVuSerif", fontSize=9.2, leading=13.2,
        textColor=MUTED, alignment=TA_JUSTIFY, leftIndent=8, rightIndent=8,
        spaceBefore=4, spaceAfter=6,
    ))
    return ss


S = styles()


def P(text, style="mbody"):
    return Paragraph(text, S[style])


def bullets(items, style="mbullet"):
    out = []
    for it in items:
        out.append(Paragraph(f"•  {it}", S[style]))
    return out


def table(headers, rows, col_widths, zebra=True):
    head = [Paragraph(h, S["mth"]) for h in headers]
    data = [head]
    for r in rows:
        line = []
        for i, cell in enumerate(r):
            st = S["tdc"] if i > 0 else S["mtd"]
            if isinstance(cell, tuple):
                cell, bold = cell
                st = S["tdb"] if bold else st
            line.append(Paragraph(str(cell), st))
        data.append(line)
    t = Table(data, colWidths=col_widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVuBold"),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.25, HexColor("#C5D0C8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    if zebra:
        for i in range(1, len(data)):
            if i % 2 == 0:
                cmds.append(("BACKGROUND", (0, i), (-1, i), GREEN_L))
    t.setStyle(TableStyle(cmds))
    return t


def memo(txt):
    return Callout("MEMORIZE PARA A PROVA", txt, S, "memo")


def dica(txt):
    return Callout("DICA DE PROVA", txt, S, "dica")


def atencao(txt):
    return Callout("ATENÇÃO", txt, S, "atencao")


def lei(txt):
    return Callout("FUNDAMENTO LEGAL", txt, S, "lei")


def q(n, enun, opts):
    return QBox(n, enun, opts, S)


# ---------------------------------------------------------------------------
# Páginas especiais
# ---------------------------------------------------------------------------

def draw_cover(c, doc):
    c.saveState()
    c.setFillColor(GREEN_D)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.rect(0, H - 38 * mm, W, 38 * mm, stroke=0, fill=1)
    c.setFillColor(RED)
    c.rect(0, 0, W, 18 * mm, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, 18 * mm, W, 3.2 * mm, stroke=0, fill=1)
    c.rect(0, H - 41.2 * mm, W, 3.2 * mm, stroke=0, fill=1)

    c.setFillColor(GOLD)
    c.setFont("DejaVuBold", 9)
    c.drawCentredString(W / 2, H - 16 * mm, "REPÚBLICA DE ANGOLA")
    c.setFillColor(white)
    c.setFont("DejaVu", 8.5)
    c.drawCentredString(W / 2, H - 22 * mm, "MINISTÉRIO DA SAÚDE  •  CONCURSO PÚBLICO DE INGRESSO EXTERNO")
    c.setFont("DejaVuBold", 8)
    c.drawCentredString(W / 2, H - 28 * mm, "CARREIRA DE APOIO HOSPITALAR")

    c.setFillColor(GOLD)
    c.setFont("DejaVuBold", 11)
    c.drawCentredString(W / 2, H - 72 * mm, "MANUAL DE APOIO AO ESTUDO")
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.line(55 * mm, H - 76 * mm, W - 55 * mm, H - 76 * mm)

    c.setFillColor(white)
    c.setFont("DejaVuBold", 28)
    c.drawCentredString(W / 2, H - 98 * mm, "SECRETÁRIO CLÍNICO")
    c.setFont("DejaVu", 12)
    c.setFillColor(HexColor("#D5EDE0"))
    c.drawCentredString(W / 2, H - 110 * mm, "Programa oficial completo, com legislação, indicadores,")
    c.drawCentredString(W / 2, H - 116 * mm, "raciocínio e questões no formato de prova")

    y = H - 140 * mm
    topics = [
        "I. Organização da Administração Pública",
        "II. Pauta Deontológica da Função Pública",
        "III. Raciocínio Verbal",
        "IV. Raciocínio Numérico",
        "V. COVID-19",
        "VI. Cultura Geral",
        "VII. Divisão Político-Administrativa (2024/2025)",
        "VIII. Censo Populacional 2024",
        "IX. IIMS 2023–2024",
        "X. Inteligência Artificial",
    ]
    c.setFont("DejaVu", 9.2)
    c.setFillColor(HexColor("#E8F5EC"))
    for i, t in enumerate(topics):
        col = 0 if i < 5 else 1
        row = i if i < 5 else i - 5
        x = 28 * mm + col * 90 * mm
        yy = y - row * 8 * mm
        c.setFillColor(GOLD)
        c.circle(x, yy + 1.4, 1.3, stroke=0, fill=1)
        c.setFillColor(HexColor("#E8F5EC"))
        c.drawString(x + 5 * mm, yy, t)

    c.setFillColor(GOLD)
    c.setFont("DejaVuBold", 9)
    c.drawCentredString(W / 2, 42 * mm, "EDIÇÃO DE ESTUDO  •  2026")
    c.setFillColor(white)
    c.setFont("DejaVu", 7.6)
    c.drawCentredString(W / 2, 7.5 * mm, "Material de apoio pedagógico  •  Não substitui a legislação oficial nem os tópicos publicados pelo MINSA")
    c.restoreState()


def header_footer(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(GREEN_D)
    c.rect(0, H - 12 * mm, W, 12 * mm, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, H - 13.1 * mm, W, 1.1 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("DejaVu", 7.2)
    c.drawString(16 * mm, H - 8.2 * mm, "MINSA  •  Manual de Apoio  •  Secretário Clínico")
    c.drawRightString(W - 16 * mm, H - 8.2 * mm, "Concurso Público de Ingresso Externo")

    c.setFillColor(GREEN_D)
    c.rect(0, 0, W, 11 * mm, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, 11 * mm, W, 1.1 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("DejaVu", 7.2)
    c.drawString(16 * mm, 4.6 * mm, "Estudo orientado pelos tópicos oficiais do MINSA")
    c.drawRightString(W - 16 * mm, 4.6 * mm, f"Página {doc.page - 1}")
    c.restoreState()


# ---------------------------------------------------------------------------
# Conteúdo
# ---------------------------------------------------------------------------

def toc():
    story = [P("ÍNDICE", "mh1"), HRule(), Spacer(1, 4)]
    items = [
        ("Como usar este manual e o perfil do Secretário Clínico", "4"),
        ("I. Noções gerais sobre a organização da Administração Pública", "6"),
        ("II. Pauta Deontológica da Função Pública", "12"),
        ("III. Raciocínio verbal", "18"),
        ("IV. Raciocínio numérico", "24"),
        ("V. COVID-19", "30"),
        ("VI. Cultura geral", "36"),
        ("VII. Divisão político-administrativa de Angola (2024)", "42"),
        ("VIII. Censo Populacional de Angola 2024", "48"),
        ("IX. Inquérito de Indicadores Múltiplos e de Saúde (IIMS 2023–2024)", "54"),
        ("X. Inteligência Artificial", "60"),
        ("Bateria de questões tipo prova (com resolução)", "66"),
        ("Folha de respostas e chave", "76"),
        ("Fontes e legislação de consulta", "78"),
    ]
    rows = []
    for tit, pg in items:
        rows.append([
            Paragraph(tit, S["toc_item"]),
            Paragraph(pg, ParagraphStyle("pg", parent=S["toc_item"], alignment=TA_RIGHT, textColor=GREEN)),
        ])
    t = Table(rows, colWidths=[155 * mm, 18 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story += [t, Spacer(1, 10)]
    story.append(dica(
        "A prova do MINSA mistura <b>conhecimentos gerais da Função Pública</b>, "
        "<b>actualidade angolana</b> (DPA, Censo, IIMS) e <b>raciocínio</b>. "
        "Estude primeiro os números e as leis assinalados nas caixas verdes — "
        "são os itens mais cobrados em concursos de ingresso."
    ))
    return story


def cap_uso():
    s = [
        P("COMO USAR ESTE MANUAL", "mh1"), HRule(),
        P("Este manual foi elaborado para o candidato ao concurso público de ingresso externo do Ministério da Saúde (MINSA), carreira de <b>Apoio Hospitalar — Secretário Clínico</b>, segundo os tópicos oficiais publicados pela Direcção Nacional de Recursos Humanos. Não é um diploma legal nem um formulário de inscrição: é um instrumento de estudo, organizado para memorização, compreensão e treino."),
        P("Como estudar (plano de 14 dias)", "mh2"),
    ]
    s += bullets([
        "<b>Dias 1–2.</b> Administração Pública + Pauta Deontológica. Decore princípios, deveres e diplomas (CRA, Lei n.º 26/22, Resolução n.º 27/94, Lei n.º 3/10).",
        "<b>Dias 3–4.</b> Cultura geral de Angola e Divisão Político-Administrativa: 21 províncias, sedes, números 326/378 e as 3 novas províncias.",
        "<b>Dias 5–6.</b> Censo 2024 e IIMS 2023–2024. Memorize indicadores (população, urbanização, mortalidade, nutrição, vacinação).",
        "<b>Dias 7–8.</b> COVID-19 e Inteligência Artificial, com ênfase em conceitos, ética e protecção de dados no hospital.",
        "<b>Dias 9–11.</b> Raciocínio verbal e numérico: faça todos os exercícios sem consultar as respostas.",
        "<b>Dias 12–13.</b> Simulado completo no tempo (60–90 minutos, conforme o edital).",
        "<b>Dia 14.</b> Revisão só das caixas «MEMORIZE» e dos erros do simulado.",
    ])
    s += [
        P("O que faz o Secretário Clínico", "mh2"),
        P("O secretário clínico é o profissional de apoio hospitalar que organiza o fluxo administrativo da unidade sanitária: recepção e encaminhamento de utentes, marcação de consultas e exames, abertura e arquivo do processo clínico, transcrição e organização de documentação médica, estatística simples de produção, e apoio à comunicação entre serviços. Actua na interface entre o cidadão e a equipa de saúde, pelo que <b>sigilo, urbanidade e rigor documental</b> são competências nucleares."),
    ]
    s += bullets([
        "Atendimento e informação ao utente (com urbanidade e imparcialidade).",
        "Registo de dados pessoais e clínicos — sempre com dever de protecção e sigilo.",
        "Organização da agenda clínica e da lista de espera.",
        "Preparação de guias, relatórios, mapas estatísticos e correspondência oficial.",
        "Arquivo activo e morto do processo clínico, segundo as normas da unidade.",
        "Apoio à facturação, às altas e à articulação com outros serviços (laboratório, internamento, farmácia).",
    ])
    s.append(atencao(
        "O secretário clínico <b>não diagnostica, não prescreve e não divulga informação clínica</b> a terceiros. "
        "Qualquer pedido de dados de doentes (incluindo familiares, jornalistas ou autoridades sem competência legal) "
        "deve ser encaminhado à direcção clínica ou ao responsável pelo processo, nos termos da lei."
    ))
    return s


def cap_admin():
    s = [
        P("I. NOÇÕES GERAIS SOBRE A ORGANIZAÇÃO DA ADMINISTRAÇÃO PÚBLICA", "mh1"),
        HRule(),
        P("1. Conceito e finalidade", "mh2"),
        P("A Administração Pública é o conjunto de órgãos, serviços e agentes que, sob a direcção política do Estado, asseguram a satisfação das necessidades colectivas (saúde, educação, segurança, justiça, infra-estruturas). Não se confunde com o Governo (órgão político): a Administração <b>executa</b> as políticas públicas, no respeito pela Constituição e pela lei."),
        P("Nos termos do artigo 198.º da Constituição da República de Angola (CRA), a Administração Pública é estruturada com base nos princípios da <b>simplificação administrativa</b>, da <b>aproximação dos serviços às populações</b> e da <b>desconcentração e descentralização administrativas</b>."),
        lei("CRA, Título V (Administração Pública): arts. 198.º (princípios), 198.º-A (âmbito), 199.º (estrutura), 200.º (direitos dos administrados), 200.º-A (Administração Central). Lei n.º 26/22, de 22 de Agosto — Lei de Bases da Função Pública (revogou a Lei n.º 17/90)."),
        P("2. Âmbito da Administração Pública (art. 198.º-A da CRA)", "mh2"),
    ]
    s += bullets([
        "<b>Administração Directa do Estado</b> — ministérios, serviços centrais e órgãos desconcentrados (ex.: Gabinetes Provinciais de Saúde) sujeitos ao poder de direcção do Titular do Poder Executivo.",
        "<b>Administração Indirecta do Estado</b> — institutos públicos, fundos e empresas públicas que prosseguem fins do Estado com autonomia administrativa e, em regra, financeira.",
        "<b>Administração Autónoma</b> — entes com autonomia própria (poder local / autarquias, quando instituídas).",
        "<b>Administração Independente</b> — entidades administrativas independentes, com garantia de isenção (reguladores, órgãos de garantia).",
    ])
    s += [
        P("3. Administração Central e Local", "mh2"),
        P("A <b>Administração Central</b> (art. 200.º-A) integra os órgãos e serviços sujeitos à direcção e superintendência do Titular do Poder Executivo. As suas atribuições abrangem todo o território nacional. A <b>Administração Local do Estado</b> é exercida pelos governos provinciais e pelas administrações municipais, que representam o Executivo no território e asseguram a execução das políticas sectoriais — incluindo a saúde."),
        P("No sector da saúde, a cadeia típica é: <b>MINSA</b> (política nacional) → <b>Gabinetes Provinciais de Saúde</b> → <b>Direcções / Administrações Municipais de Saúde</b> → <b>unidades sanitárias</b> (hospitais, centros e postos de saúde). O secretário clínico insere-se na última linha, mas está vinculado a toda a hierarquia administrativa."),
        P("4. Princípios da Função Pública (Lei n.º 26/22, art. 6.º)", "mh2"),
        P("A Lei de Bases da Função Pública enumera os princípios que o candidato deve saber reconhecer e distinguir. Em prova, o enunciado costuma descrever uma situação e pedir o princípio violado ou aplicado."),
    ]
    princ = [
        ("Interesse público", "O interesse colectivo prevalece sobre o interesse particular do funcionário ou de terceiros."),
        ("Ética e deontologia", "A conduta profissional obedece a deveres morais e profissionais, para além da lei formal."),
        ("Igualdade", "Tratamento igual de situações iguais; proibição de discriminação."),
        ("Legalidade", "Só se pode actuar nos termos da Constituição, da lei e dos regulamentos."),
        ("Justiça", "Decisões equitativas, sem arbítrio."),
        ("Proporcionalidade", "Os meios usados devem ser adequados, necessários e equilibrados face ao fim."),
        ("Imparcialidade", "Isenção política, económica, religiosa ou pessoal."),
        ("Responsabilização", "O agente responde pelos seus actos e omissões."),
        ("Probidade administrativa", "Honestidade, lisura e recusa de vantagens indevidas."),
        ("Respeito pelo património público", "Bens do Estado não se usam em proveito próprio."),
        ("Eficiência e eficácia", "Fazer bem (qualidade) e alcançar resultados (fins)."),
        ("Rigor", "Exactidão no cumprimento das tarefas e no tratamento da informação."),
        ("Transparência e publicidade", "Actos acessíveis e publicitados, salvo segredo legal."),
        ("Finalidade", "Os poderes só podem ser usados para o fim para que foram conferidos (proibição do desvio de poder)."),
        ("Motivação", "Os actos administrativos devem ser fundamentados."),
        ("Moralidade", "Conformidade com a ética pública e os bons costumes administrativos."),
        ("Racionalidade", "Uso racional dos recursos e dos procedimentos."),
        ("Segurança jurídica", "Estabilidade e previsibilidade das decisões."),
        ("Responsabilidade profissional", "Competência técnica e assunção das consequências do exercício."),
        ("Urbanidade", "Cortesia no trato com utentes, colegas e hierarquia."),
        ("Respeito pelos direitos dos particulares e ampla defesa", "O cidadão é ouvido e pode defender-se."),
    ]
    rows = [[n, d] for n, d in princ]
    s.append(table(["Princípio", "Ideia-chave para a prova"], rows, [48 * mm, 125 * mm]))
    s.append(P("Quadro 1 — Princípios do art. 6.º da Lei n.º 26/22.", "mcaption"))
    s += [
        memo("Não confunda <b>eficácia</b> (atingir o resultado) com <b>eficiência</b> (atingir o resultado com o menor desperdício de recursos). "
             "Não confunda <b>desconcentração</b> (o Estado reparte competências pelos seus próprios órgãos, mantendo a hierarquia) com "
             "<b>descentralização</b> (transfere competências para entes com personalidade jurídica própria)."),
        P("5. Missão e objectivos da Função Pública", "mh2"),
        P("Nos termos dos arts. 3.º e 5.º da Lei n.º 26/22, a missão é prestar serviço público à Nação, considerando o <b>utente como elemento central</b>, optimizar recursos e modernizar a gestão. Objectivos: serviço de qualidade com cultura de serviço público; melhoria contínua; bem-estar dos funcionários e eficiência profissional."),
        P("6. Vínculo, ingresso e conceitos-chave (arts. 4.º e 10.º–13.º)", "mh2"),
    ]
    s += bullets([
        "<b>Funcionário</b> — pessoa com vínculo de emprego público por <b>nomeação</b> (regra de ingresso).",
        "<b>Agente administrativo</b> — ingressa por nomeação provisória ou por <b>contrato de trabalho público</b>.",
        "<b>Carreira</b> — conjunto hierarquizado de categorias da mesma natureza.",
        "<b>Categoria</b> — posição do funcionário na carreira, segundo o conteúdo funcional.",
        "<b>Quadro de pessoal</b> — documento que fixa carreiras, categorias e número de postos.",
        "O ingresso faz-se, em regra, por <b>concurso público</b>. A nomeação é a regra; o contrato de trabalho público é excepcional.",
    ])
    s += [
        P("7. Direitos do funcionário (art. 9.º) — síntese", "mh2"),
    ]
    s += bullets([
        "Desempenho efectivo das funções da carreira; progressão e promoção por mérito.",
        "Justa remuneração; formação inicial e contínua; férias e licenças.",
        "Segurança, higiene e saúde no trabalho; protecção social.",
        "Dignidade, intimidade e urbanidade por parte dos superiores.",
        "Consulta do processo individual; não ser punido sem audiência prévia.",
        "Direito à greve e à filiação sindical, nos termos da lei.",
    ])
    s += [
        P("8. Direitos e garantias dos administrados (art. 200.º da CRA)", "mh2"),
        P("O cidadão tem direito a ser <b>ouvido</b> nos processos que o afectem, a ser <b>informado</b> sobre o andamento e a <b>conhecer as decisões</b>. No hospital, isto traduz-se em informação clara sobre horários, documentos exigidos, filas, resultados (pelo profissional competente) e vias de reclamação — sem quebrar o sigilo clínico."),
        P("9. O MINSA no aparelho do Estado", "mh2"),
        P("O Ministério da Saúde é o departamento ministerial responsável pela política nacional de saúde e pela tutela do Serviço Nacional de Saúde (SNS). A Ministra da Saúde é a Dra. <b>Sílvia Paula Valentim Lutucuta</b>. O concurso é organizado pela Direcção Nacional de Recursos Humanos. Contactos oficiais de referência nos tópicos: Av. 21 de Janeiro, Gamek, Edifício Sede (rés-do-chão), Luanda; info.rh@minsa.gov.ao; sigrh.minsa.gov.ao / concurso-minsa.ao."),
        dica("Se a pergunta falar em «órgãos de soberania», recorde: Presidente da República, Assembleia Nacional, Tribunais e (no desenho constitucional angolano) os demais órgãos previstos na CRA. O MINSA <b>não</b> é órgão de soberania — é órgão da Administração Central do Estado."),
    ]
    return s


def cap_deonto():
    s = [
        P("II. PAUTA DEONTOLÓGICA DA FUNÇÃO PÚBLICA", "mh1"),
        HRule(),
        P("1. O que é deontologia", "mh2"),
        P("Deontologia (do grego <i>deon</i>, dever) é o conjunto de deveres éticos de uma profissão. Na Função Pública, a deontologia transforma a obrigação legal em <b>devoção ao interesse público</b>: o funcionário não se limita a «não violar a lei»; serve o cidadão com justiça, transparência e ética, para criar confiança entre o Estado e a sociedade."),
        lei("Diploma-base da pauta: <b>Resolução n.º 27/94, de 26 de Agosto</b> (Pauta Deontológica do Serviço Público), aprovada no Governo do Primeiro-Ministro Marcolino Moco. Complementam-na a <b>Lei n.º 26/22</b> (deveres do art. 7.º) e a <b>Lei n.º 3/10, de 29 de Março</b> (Lei da Probidade Pública)."),
        P("2. Âmbito, conteúdo e aplicação (Resolução n.º 27/94, I)", "mh2"),
    ]
    s += bullets([
        "Abrange <b>todos</b> os trabalhadores da Administração Pública, qualquer que seja o cargo, o nível ou o local — incluindo dirigentes.",
        "Contém deveres ético-profissionais e sociais nas relações com os cidadãos, com entidades particulares e com os órgãos do Estado.",
        "A sua aplicação <b>não dispensa</b> regras deontológicas específicas de cada instituição (no hospital: sigilo clínico, normas de infecção, regulamento interno).",
    ])
    s += [
        P("3. Valores essenciais da Pauta (n.ºs 4 a 8)", "mh2"),
    ]
    vals = [
        ("4. Interesse público", "Funções exercidas exclusivamente ao serviço do interesse colectivo. Os interesses gerais são a razão de ser última da actuação pública."),
        ("5. Legalidade", "Actuar sempre em conformidade com a lei; conhecer leis e regulamentos; contribuir para a consciência jurídica dos cidadãos."),
        ("6. Neutralidade", "Imparcialidade e objectividade; igualdade de todos perante a lei; recusa de critérios políticos, económicos ou religiosos."),
        ("7. Integridade e responsabilidade", "Verticalidade, discrição, lealdade e transparência, para aumentar a confiança nas instituições."),
        ("8. Competência", "Mérito, brio e eficiência como critérios de profissionalismo; a qualidade do serviço depende da capacitação permanente."),
    ]
    s.append(table(["Número / valor", "Conteúdo essencial"], [[a, b] for a, b in vals], [42 * mm, 131 * mm]))
    s.append(P("Quadro 2 — Valores essenciais da Resolução n.º 27/94.", "mcaption"))
    s += [
        P("4. Deveres para com os cidadãos (n.ºs 9 a 13)", "mh2"),
    ]
    s += bullets([
        "<b>9. Qualidade na prestação do serviço</b> — bem servir, com eficiência, rigor e humanidade.",
        "<b>10. Isenção e imparcialidade</b> — todos os cidadãos são iguais perante a lei; mesmo atendimento, mesmo encaminhamento.",
        "<b>11. Competência e proporcionalidade</b> — meios técnicos adequados e proporcionais ao fim.",
        "<b>12. Cortesia e informação</b> — trato cortês e dever de esclarecer o cidadão.",
        "<b>13. Probidade</b> — proibição de solicitar ou aceitar presentes, empréstimos, facilidades ou quaisquer ofertas que comprometam a independência e a credibilidade da Administração.",
    ])
    s += [
        P("5. Deveres especiais para com a Administração (n.ºs 14 a 19)", "mh2"),
    ]
    s += bullets([
        "<b>14. Serviço público</b> — o interesse geral prevalece; é vedado usar o cargo para fins particulares.",
        "<b>15. Dedicação</b> — espírito de missão, prontidão, racionalidade e eficácia; respeito pela hierarquia e criatividade na resolução de problemas.",
        "<b>16. Autoformação, aperfeiçoamento e actualização</b> — conhecer a lei e actualizar-se permanentemente (os chefes devem ser exemplo).",
        "<b>17. Reserva e discrição</b> — não divulgar factos conhecidos em serviço nem usá-los em proveito próprio ou de terceiros.",
        "<b>18. Parcimónia</b> — uso criterioso dos bens públicos; proibição de desperdício e de uso pessoal.",
        "<b>19. Solidariedade e cooperação</b> — espírito de equipa e entreajuda.",
    ])
    s += [
        P("6. Deveres para com os órgãos de soberania (n.ºs 20 e 21)", "mh2"),
    ]
    s += bullets([
        "<b>20. Zelo e dedicação</b> — independentemente das convicções políticas ou ideológicas, agir com eficiência e objectividade, respeitando os direitos fundamentais.",
        "<b>21. Lealdade</b> — executar com lealdade os programas e missões superiores, no respeito escrupuloso à lei e às <b>ordens legítimas</b> dos superiores.",
    ])
    s.append(atencao(
        "O dever de obediência <b>não cobre ordens criminosas</b>. A Lei n.º 26/22 esclarece: não existe dever de obediência quando esta implicar a prática de crime. "
        "O subordinado deve tentar demover o superior. Na secretaria clínica, isto aplica-se a pedidos de falsificar registos, «desaparecer» processos ou vender vagas de consulta."
    ))
    s += [
        P("7. Deveres da Lei n.º 26/22 (art. 7.º) — lista de memorização", "mh2"),
        P("A prova pode pedir o nome exacto do dever. Memorize os onze deveres positivos e as quatro proibições:"),
    ]
    deveres = [
        ("Respeito aos símbolos nacionais e instituições", "Uso correcto da bandeira, hino, armas e dignidade das instituições."),
        ("Proteger os dados pessoais", "Especialmente relevante no hospital (processo clínico, BI, telefone, diagnóstico)."),
        ("Obediência", "Constituição, leis, regulamentos e ordens legítimas de serviço."),
        ("Lealdade", "Subordinação aos objectivos do serviço e ao interesse público."),
        ("Neutralidade / isenção", "Imparcialidade política, económica, social ou outra."),
        ("Discrição", "Sigilo dos factos não públicos conhecidos em serviço; segredo profissional."),
        ("Parcimónia", "Proteger e conservar os bens do Estado; nada de uso particular."),
        ("Assiduidade", "Comparecer regular e continuamente."),
        ("Pontualidade", "Cumprir o horário."),
        ("Urbanidade", "Respeito a utentes, colegas, chefes e subordinados."),
        ("Zelo", "Conhecer as normas e aperfeiçoar a técnica para exercer com eficiência."),
    ]
    s.append(table(["Dever (art. 7.º, n.º 1)", "Tradução prática no hospital"], [[a, b] for a, b in deveres], [58 * mm, 115 * mm]))
    s.append(P("Quadro 3 — Deveres do funcionário e aplicação na secretaria clínica.", "mcaption"))
    s += [
        P("O n.º 2 do art. 7.º proíbe ainda: conflitos de interesses; obtenção de vantagens indevidas pelo cargo; uso de informação privilegiada; pressão, ameaça ou assédio moral ou sexual a colegas, subordinados ou utentes."),
        P("8. Probidade pública (Lei n.º 3/10)", "mh2"),
        P("A Lei da Probidade Pública exige do agente público legalidade, competência, respeito pelo património, imparcialidade, interesse público, responsabilidade, urbanidade, reserva, parcimónia e lealdade. Constitui <b>improbidade</b> a acção ou omissão que viole estes deveres, bem como o enriquecimento ilícito e os actos que prejudiquem o património público."),
        memo("Três diplomas que caem quase sempre: <b>Resolução n.º 27/94</b> (pauta), <b>Lei n.º 26/22</b> (bases da Função Pública) e <b>Lei n.º 3/10</b> (probidade). Relacione cada situação prática a um dever: oferta de um «agasalho» = probidade; chegar tarde = pontualidade; comentar o diagnóstico do doente no candongueiro = discrição / dados pessoais / sigilo."),
        P("9. Deontologia aplicada ao Secretário Clínico", "mh2"),
    ]
    s += bullets([
        "Chamar o utente pelo nome, sem gritar diagnósticos na fila.",
        "Não «furar a fila» de familiares, conhecidos ou chefes — imparcialidade.",
        "Não fotografar processos nem partilhar listagens em grupos de WhatsApp.",
        "Não aceitar dinheiro para «acelerar» uma marcação.",
        "Cuidar da impressora, papel, computadores e selos da instituição (parcimónia).",
        "Manter o posto de trabalho organizado e o arquivo recuperável (zelo).",
        "Tratar com igual respeito o doente pobre, o idoso, a grávida e o dirigente.",
    ])
    return s


def cap_verbal():
    s = [
        P("III. RACIOCÍNIO VERBAL", "mh1"),
        HRule(),
        P("O tópico oficial pede capacidade para <b>interpretar</b>, <b>resolver problemas com operações verbais simples</b> e demonstrar <b>conhecimento do vocabulário português</b>. Não é uma prova de literatura: é uma prova de leitura atenta, lógica da língua e precisão lexical."),
        P("1. Interpretação de texto", "mh2"),
        P("Leia o texto <b>duas vezes</b>. Na primeira, capte o tema e o tom (informativo, argumentativo, normativo). Na segunda, sublinhe: sujeito das acções, números, negações («não», «salvo», «exceto/excepto»), e o que o texto <b>não</b> diz. As opções incorrectas costumam: generalizar demais; inverter a causa e o efeito; usar palavras absolutas («sempre», «nunca», «todos») que o texto não autoriza; ou trazer informação verdadeira mas <b>externa</b> ao texto."),
        P("Texto de treino A", "mh3"),
        P("«A Administração Pública visa a prossecução do interesse público, no respeito pelos direitos e interesses legalmente protegidos dos cidadãos. Os órgãos e agentes administrativos estão subordinados à lei e devem actuar com justiça e imparcialidade. O utente não é um estorvo da secretaria: é a razão de ser do serviço. Por isso, a qualidade do atendimento mede-se tanto pelo cumprimento dos prazos como pela urbanidade com que se trata a pessoa que espera.»", "quote"),
    ]
    s += [
        q(1, "Segundo o Texto A, é correcto afirmar que:", [
            ("A", "O interesse público autoriza o agente a ignorar os direitos dos cidadãos."),
            ("B", "A qualidade do atendimento combina cumprimento de prazos e urbanidade."),
            ("C", "A imparcialidade é facultativa quando há urgência de serviço."),
            ("D", "O utente só deve ser atendido depois de resolvidos os assuntos internos."),
            ("E", "A subordinação à lei aplica-se apenas aos dirigentes."),
        ]),
        Spacer(1, 6),
        P("2. Vocabulário: sinónimos, antónimos e precisão", "mh2"),
        P("Em prova, peça-se o sinónimo <b>no contexto</b>. «Pauta» pode ser norma de conduta (deontologia) ou lista de assuntos. «Processo» pode ser o conjunto de papéis do doente ou o procedimento administrativo. «Alta» no hospital não é «preço elevado»."),
    ]
    vocab = [
        ["Deontologia", "Conjunto de deveres éticos de uma profissão", "Amoralidade / arbítrio"],
        ["Imparcialidade", "Isenção; ausência de favoritismo", "Parcialidade / favorecimento"],
        ["Probidade", "Honestidade; integridade no cargo", "Improbidade / corrupção"],
        ["Parcimónia", "Uso moderado e cuidadoso dos recursos", "Esbanjamento / desperdício"],
        ["Assiduidade", "Comparecimento regular ao serviço", "Absentismo"],
        ["Urbanidade", "Cortesia e boa educação no trato", "Grosseria / descortesia"],
        ["Zelo", "Cuidado diligente e competente", "Negligência / desleixo"],
        ["Sigilo", "Dever de guardar segredo", "Indiscrição / divulgação"],
        ["Desconcentração", "Repartir competências na mesma pessoa colectiva", "Concentração"],
        ["Descentralização", "Transferir competências a ente autónomo", "Centralização"],
        ["Eficácia", "Capacidade de atingir o resultado", "Ineficácia"],
        ["Eficiência", "Atingir o resultado com bom uso de meios", "Desperdício / ineficiência"],
        ["Utente", "Utilizador do serviço público", "Prestador / agente"],
        ["Prognóstico", "Previsão da evolução de uma doença", "Diagnóstico (identificação)"],
        ["Etiologia", "Causa / origem de uma doença", "Sintomatologia"],
        ["Prevalência", "Casos existentes num momento", "Incidência (casos novos)"],
        ["Censo", "Contagem oficial da população", "Sondagem / amostra"],
        ["Comuna", "Unidade territorial abaixo do município", "Província"],
        ["Alocação", "Atribuição de recursos", "Confisco"],
        ["Motivação (acto)", "Fundamentação da decisão", "Arbitrariedade"],
    ]
    s.append(table(["Termo", "Sentido usual na prova", "Contraste útil"], vocab, [38 * mm, 75 * mm, 60 * mm]))
    s.append(P("Quadro 4 — Vocabulário de alta incidência.", "mcaption"))
    s += [
        P("3. Analogias verbais", "mh2"),
        P("A analogia pede a mesma <b>relação lógica</b>. Identifique a relação do par-base (causa→efeito, parte→todo, agente→instrumento, grau, antónimo, lugar→habitante) e aplique-a ao segundo par."),
    ]
    s += bullets([
        "MÉDICO está para DIAGNÓSTICO como JUIZ está para <b>SENTENÇA</b> (acto próprio da função).",
        "HOSPITAL está para DOENTE como ESCOLA está para <b>ALUNO</b> (instituição → utente).",
        "SIGILO está para DIVULGAÇÃO como PROBIDADE está para <b>CORRUPÇÃO</b> (antónimos de dever).",
        "PROVÍNCIA está para GOVERNADOR como MUNICÍPIO está para <b>ADMINISTRADOR MUNICIPAL</b>.",
    ])
    s += [
        P("4. Ortografia e vocabulário da norma usada na Administração angolana", "mh2"),
        P("Os documentos oficiais angolanos conservam, em regra, a grafia tradicional: <b>objectivo, acção, colecção, direcção, protecção, carácter, facto, acto, actual, óptimo, electrónico, concepção</b>. Em prova, se o texto oficial usar essa grafia, não a «corrija» para a do Acordo Ortográfico de 1990. Atenção ainda a: <b>há</b> (tempo decorrido) ≠ <b>à</b> (a+a); <b>mau</b> (adjectivo) ≠ <b>mal</b> (advérbio); <b>senão</b> (caso contrário / a não ser) ≠ <b>se não</b> (condição negativa); <b>acerca de</b> (sobre) ≠ <b>há cerca de</b> (aproximadamente)."),
        P("5. Coerência, coesão e operações verbais simples", "mh2"),
        P("Operações verbais típicas: completar um período com o conector certo (<b>porém, portanto, porque, embora, conforme, salvo</b>); identificar o referente de um pronome; ordenar frases; detectar contradição; escolher o título que resume o texto. «Portanto» introduz conclusão; «porque» introduz causa; «embora» introduz concessão; «salvo» introduz excepção."),
        P("Texto de treino B", "mh3"),
        P("«O processo clínico é o conjunto de documentos que registam a identidade, a história, os exames, o tratamento e a evolução do doente. Não é propriedade do profissional que o preenche: pertence à instituição e serve o doente. O secretário que extravia um processo, ou que o mostra a quem não tem legitimidade, fere ao mesmo tempo o zelo, a discrição e a protecção de dados.»", "quote"),
        q(2, "No Texto B, a expressão «não é propriedade do profissional que o preenche» significa que:", [
            ("A", "O médico não pode escrever no processo."),
            ("B", "O processo pode ser levado para casa pelo secretário, por ser da instituição."),
            ("C", "O documento institucional não fica à disposição particular de quem o elabora."),
            ("D", "Só o doente pode consultar o processo, nunca a equipa de saúde."),
            ("E", "O processo deixa de existir depois da alta."),
        ]),
        Spacer(1, 6),
        P("6. Questões de treino — verbal", "mh2"),
        q(3, "Assinale o par em que a relação é a mesma de LEGALIDADE / ILEGALIDADE:", [
            ("A", "Hospital / enfermagem"),
            ("B", "Probidade / improbidade"),
            ("C", "Consulta / marcação"),
            ("D", "Província / comuna"),
            ("E", "Censo / população"),
        ]),
        Spacer(1, 5),
        q(4, "«O funcionário deve tratar com igual atenção o ministro e o camponês.» O princípio mais directamente ilustrado é:", [
            ("A", "Parcimónia"),
            ("B", "Hierarquia"),
            ("C", "Imparcialidade / igualdade"),
            ("D", "Motivação do acto"),
            ("E", "Desconcentração"),
        ]),
        Spacer(1, 5),
        q(5, "Qual das frases está correcta quanto ao sentido dos termos clínicos?", [
            ("A", "A etiologia descreve a previsão da cura."),
            ("B", "O prognóstico indica a causa da doença."),
            ("C", "O diagnóstico identifica a doença; o prognóstico estima a sua evolução."),
            ("D", "A prevalência conta apenas os casos novos do ano."),
            ("E", "Incidência e prevalência são sinónimos perfeitos."),
        ]),
        Spacer(1, 5),
        q(6, "Em «salvo disposição legal em contrário», a palavra «salvo» exprime:", [
            ("A", "Causa"),
            ("B", "Conclusão"),
            ("C", "Excepção"),
            ("D", "Tempo"),
            ("E", "Comparação"),
        ]),
        Spacer(1, 5),
        q(7, "Sinónimo contextual de «pauta deontológica»:", [
            ("A", "Lista de vencimentos"),
            ("B", "Norma de deveres éticos do serviço público"),
            ("C", "Horário de expediente"),
            ("D", "Mapa de férias"),
            ("E", "Orçamento do ministério"),
        ]),
        Spacer(1, 6),
        dica("Técnica de 40 segundos: leia a pergunta antes do texto longo, para saber o que procurar; elimine duas opções absurdas; desconfie da opção que reproduz uma frase do texto mas muda um quantificador (todos/alguns, sempre/em regra)."),
    ]
    return s


def cap_numerico():
    s = [
        P("IV. RACIOCÍNIO NUMÉRICO", "mh1"),
        HRule(),
        P("O tópico pede capacidade para <b>interpretar</b> e <b>resolver problemas com operações numéricas</b>. No concurso do MINSA, os números vêm muitas vezes disfarçados de situação hospitalar ou de indicador sanitário. Domine as quatro operações, percentagens, regra de três, médias, razões e leitura de tabelas."),
        P("1. Operações e ordem", "mh2"),
        P("Ordem: parênteses → potências → multiplicação e divisão (da esquerda para a direita) → adição e subtracção. Converta sempre as unidades antes de calcular (horas em minutos, kwanzas em milhares, milhares em milhões)."),
        P("2. Frações, razões e proporções", "mh2"),
        P("Uma razão compara duas grandezas (3 enfermeiros para 45 doentes = 3:45 = 1:15). Uma proporção afirma que duas razões são iguais: a/b = c/d, donde <b>a × d = b × c</b> (produtos cruzados). A <b>regra de três simples</b> resolve a quarta proporcional. Se as grandezas forem <b>directamente</b> proporcionais (mais horas → mais fichas registadas), a seta vai no mesmo sentido. Se forem <b>inversamente</b> proporcionais (mais funcionários → menos dias para o mesmo arquivo), inverte-se uma razão."),
        P("3. Percentagens", "mh2"),
        P("x% de N = (x/100) × N. Aumentar 20% é multiplicar por 1,20; reduzir 20% é multiplicar por 0,80. Cuidado: subir 20% e depois descer 20% <b>não</b> volta ao valor inicial (100 → 120 → 96). A variação percentual é ((final − inicial) / inicial) × 100."),
        memo("Fórmulas que caem em prova de saúde: <b>taxa = (casos / população) × 1 000</b> (ou × 100 000, conforme o indicador). Ocupação de camas = (doentes internados / camas disponíveis) × 100. Média = soma / n. Se a prova der «32 óbitos por 1 000 nados-vivos», em 5 000 nados-vivos espera 32 × 5 = 160 óbitos."),
        P("4. Médias e interpretação de tabelas", "mh2"),
        P("A média aritmética esconde desigualdades: a média nacional de um indicador pode ser puxada por Luanda. Quando a tabela tiver «urbano / rural», calcule cada linha à parte. Leia o <b>cabeçalho das unidades</b> (milhões, %, por 1 000)."),
        P("5. Problemas resolvidos (modelo de prova)", "mh2"),
        P("<b>Problema 1.</b> Uma unidade atendeu 240 utentes. Destes, 15% eram crianças. Quantas crianças foram atendidas?"),
        P("Resolução: 15% de 240 = 0,15 × 240 = <b>36 crianças</b>."),
        P("<b>Problema 2.</b> O arquivo tem 1 800 processos. Três secretários arquivam à mesma velocidade e terminam em 12 dias. Em quantos dias terminam quatro secretários, no mesmo ritmo?"),
        P("Resolução (inversa): 3 × 12 = 4 × d ⇒ d = 36/4 = <b>9 dias</b>."),
        P("<b>Problema 3.</b> Em 2014 a população era 25 789 024 e em 2024 era 36 604 681. O acréscimo absoluto foi 10 815 657 (arredondado nos relatórios a 10 815 656). A taxa média anual anunciada pelo INE é de <b>3,5%</b>. Não tente «adivinhar» a taxa com uma divisão simples do total por 10: a taxa média anual é composta. Na prova, use o valor oficial se ele for pedido como conhecimento; se for pedido o acréscimo absoluto, subtraia."),
        P("<b>Problema 4.</b> Taxa de mortalidade infantil = 32 por 1 000. Num município com 2 500 nados-vivos, o número esperado de óbitos infantis é 32 × 2,5 = <b>80</b>."),
        P("<b>Problema 5.</b> Um hospital tem 80 camas. Estão ocupadas 68. Taxa de ocupação = (68/80) × 100 = <b>85%</b>."),
        P("<b>Problema 6.</b> O vencimento de 150 000 Kz sofre um desconto de 8% e um abono de 12 000 Kz. Líquido = 150 000 × 0,92 + 12 000 = 138 000 + 12 000 = <b>150 000 Kz</b>."),
        P("6. Questões de treino — numérico", "mh2"),
        q(8, "30% de 450 é igual a:", [
            ("A", "90"), ("B", "120"), ("C", "135"), ("D", "150"), ("E", "180"),
        ]),
        Spacer(1, 5),
        q(9, "Uma farmácia hospitalar tinha 200 frascos. Usou 35% e recebeu depois 40 frascos. Quantos tem agora?", [
            ("A", "110"), ("B", "130"), ("C", "150"), ("D", "170"), ("E", "180"),
        ]),
        Spacer(1, 5),
        q(10, "Se 5 secretários registam 400 fichas em 8 horas, quantas fichas registam 10 secretários em 4 horas, no mesmo ritmo?", [
            ("A", "200"), ("B", "300"), ("C", "400"), ("D", "500"), ("E", "800"),
        ]),
        Spacer(1, 5),
        q(11, "A média das idades 18, 22, 25, 19 e 26 é:", [
            ("A", "20"), ("B", "21"), ("C", "22"), ("D", "23"), ("E", "24"),
        ]),
        Spacer(1, 5),
        q(12, "Um indicador passou de 40 para 52. A variação percentual foi de:", [
            ("A", "12%"), ("B", "23%"), ("C", "30%"), ("D", "52%"), ("E", "70%"),
        ]),
        Spacer(1, 5),
        q(13, "Numa enfermaria com 40 camas, a ocupação é 70%. O número de camas livres é:", [
            ("A", "10"), ("B", "12"), ("C", "14"), ("D", "18"), ("E", "28"),
        ]),
        Spacer(1, 5),
        q(14, "A razão 2:5 equivale, em percentagem do primeiro sobre o total, a:", [
            ("A", "20%"), ("B", "25%"), ("C", "28,6%"), ("D", "40%"), ("E", "50%"),
        ]),
        Spacer(1, 5),
        q(15, "Se a taxa é 16 óbitos neonatais por 1 000 nados-vivos, em 12 500 nados-vivos o número esperado é:", [
            ("A", "16"), ("B", "125"), ("C", "160"), ("D", "200"), ("E", "250"),
        ]),
        Spacer(1, 6),
        dica("Leve para a prova o hábito de <b>estimar antes de calcular</b>. Se 30% de 450 «cheira» a pouco mais de 130, a opção 90 está fora. Confira sempre a unidade (por 1 000 ou por 100 000) e se a pergunta pede o valor restante ou o valor gasto."),
    ]
    return s


def cap_covid():
    s = [
        P("V. COVID-19", "mh1"),
        HRule(),
        P("O programa pede o tema nas alíneas a) a h). Estude-as nessa ordem: a prova costuma seguir o guião."),
        P("a) Conceito", "mh2"),
        P("A COVID-19 (<i>Coronavirus Disease 2019</i>) é uma <b>doença infecciosa aguda</b>, predominantemente respiratória, causada pelo coronavírus SARS-CoV-2, identificada pela primeira vez em Wuhan (China) em Dezembro de 2019 e declarada pandemia pela OMS em 11 de Março de 2020. Pode variar de infecção assintomática até pneumonia grave e falência de órgãos. Transmite-se sobretudo por <b>gotículas e aerossóis</b> das vias respiratórias e, em menor grau, por contacto com superfícies contaminadas (fómites)."),
        P("b) Etiologia", "mh2"),
        P("O agente etiológico é o <b>SARS-CoV-2</b> (<i>Severe Acute Respiratory Syndrome Coronavirus 2</i>), vírus de ARN da família <i>Coronaviridae</i>, género <i>Betacoronavirus</i>. Entra nas células humanas principalmente pela ligação da proteína <b>Spike (S)</b> ao receptor <b>ECA2</b> (enzima conversora da angiotensina 2), abundante no epitélio respiratório. O vírus sofreu evolução em variantes (Alpha, Beta, Delta, Ómicron e sublinhagens), com diferenças de transmissibilidade e escape imunitário. Reservatório original: provavelmente zoonótico (morcegos, com possível hospedeiro intermediário)."),
        P("c) Quadro clínico", "mh2"),
        P("O período de incubação situa-se, em regra, entre <b>2 e 14 dias</b> (mais frequentemente 3–6 dias nas variantes recentes). Espectro:"),
    ]
    s += bullets([
        "<b>Assintomático</b> — infecção comprovada laboratorialmente, sem sintomas.",
        "<b>Sintomas comuns</b> — febre, tosse seca, fadiga, odinofagia (dor de garganta), coriza, cefaleias, mialgias, diarreia, anosmia (perda de olfacto) e ageusia (perda de paladar).",
        "<b>Sinais de gravidade</b> — dispneia, saturação de oxigénio baixa, dor ou pressão no tórax, confusão, lábios ou unhas cianóticos, redução da diurese.",
        "Crianças: em geral doença mais ligeira; raro o síndrome inflamatório multissistémico (MIS-C).",
        "Idosos e doentes com comorbilidades (hipertensão, diabetes, obesidade, DPOC, cancro, imunodepressão, gravidez de risco) têm maior probabilidade de formas graves.",
    ])
    s += [
        P("d) Classificação", "mh2"),
    ]
    classif = [
        ["Ligeira / leve", "Sintomas de vias aéreas superiores ou gerais, sem pneumonia e sem hipoxemia."],
        ["Moderada", "Pneumonia sem sinais de gravidade; SpO₂ habitualmente ≥ 90–94% em ar ambiente (limiares segundo protocolo vigente)."],
        ["Grave", "Pneumonia com taquipneia, tiragem, SpO₂ baixa ou infiltrados extensos."],
        ["Crítica", "Síndrome de dificuldade respiratória aguda (SDRA/ARDS), sépsis, choque, falência multiorgânica, necessidade de UCI / ventilação."],
        ["Long COVID / condição pós-COVID", "Sintomas persistentes ou novos para além de 12 semanas (fadiga, dispneia, névoa mental, palpitação)."],
    ]
    s.append(table(["Forma", "Critério prático"], classif, [48 * mm, 125 * mm]))
    s.append(P("Quadro 5 — Classificação clínica da COVID-19 (síntese OMS / protocolos clínicos).", "mcaption"))
    s += [
        P("e) Critérios de diagnóstico", "mh2"),
        P("O diagnóstico combina <b>clínica + epidemiologia + laboratório</b> (e, se indicado, imagem):"),
    ]
    s += bullets([
        "<b>Caso suspeito</b> — sintomatologia compatível e/ou contacto com caso confirmado / vínculo epidemiológico.",
        "<b>Caso provável</b> — clínico e epidemiológico forte, por vezes com imagem típica, sem confirmação laboratorial.",
        "<b>Caso confirmado</b> — detecção do SARS-CoV-2 por teste laboratorial validado.",
        "<b>RT-PCR</b> (hissope nasofaríngeo/orofaríngeo) — padrão de referência.",
        "<b>Teste rápido de antigénio</b> — útil no ponto de cuidados; um negativo em doente muito suspeito deve ser interpretado com cautela.",
        "<b>Serologia</b> (IgM/IgG) — não diagnostica infecção aguda de forma isolada; serve sobretudo para estudos de seroprevalência.",
        "<b>Imagem</b> — radiografia ou TC de tórax com opacidades em vidro despolido, quando há compromisso pulmonar.",
        "No hospital, o secretário clínico deve garantir a <b>identificação correcta do utente</b>, o registo de contactos e a circulação da requisição / resultado sem quebrar o sigilo.",
    ])
    s += [
        P("f) Complicações", "mh2"),
    ]
    s += bullets([
        "Pneumonia e SDRA / insuficiência respiratória.",
        "Tromboembolismo (TVP, embolia pulmonar), AVC, enfarte — a COVID-19 é pró-trombótica.",
        "Lesão miocárdica, arritmias, miocardite.",
        "Lesão renal aguda, alterações hepáticas.",
        "Sobreinfecção bacteriana, sépsis e choque.",
        "Descompensação de doenças crónicas (diabetes, asma, insuficiência cardíaca).",
        "Complicações da imobilidade e da UCI (úlceras, delírio, polineuropatia).",
        "Long COVID e impacto psicossocial (ansiedade, luto, estigma).",
    ])
    s += [
        P("g) Conduta", "mh2"),
        P("A conduta segue o protocolo nacional vigente (MINSA / OMS) e o nível da unidade. Princípios estáveis:"),
    ]
    s += bullets([
        "<b>Prevenção</b> — vacinação, higiene das mãos, etiqueta respiratória, ventilação, máscara em contextos de risco, isolamento de casos e quarentena de contactos conforme as regras em vigor.",
        "<b>Casos ligeiros</b> — isolamento, sintomáticos (antitérmicos), hidratação, vigilância de sinais de alarme; evitar antibióticos sem indicação (a COVID-19 é viral).",
        "<b>Casos moderados/graves</b> — oxigenoterapia, corticoides quando há necessidade de O₂ (ex. dexametasona, segundo protocolo), tromboprofilaxia, tratamento de comorbilidades, eventual antiviral conforme disponibilidade e critérios (ex. nirmatrelvir/ritonavir, remdesivir — segundo normas actualizadas).",
        "<b>Casos críticos</b> — UCI, ventilação não invasiva ou mecânica, suporte hemodinâmico.",
        "<b>Notificação</b> — doença de declaração obrigatória enquanto assim estiver classificada; o secretário apoia o preenchimento correcto das fichas.",
        "<b>Biossegurança na secretaria</b> — não triar «de ouvido» no corredor; encaminhar sintomáticos respiratórios segundo o circuito da unidade; desinfectar balcão e canetas; não reutilizar máscaras húmidas.",
    ])
    s += [
        P("h) Prognóstico", "mh2"),
        P("A maioria dos infectados evolui para cura, sobretudo jovens sem comorbilidades e pessoas vacinadas. O prognóstico agrava-se com idade avançada, doenças crónicas, gravidez de risco, imunodepressão, atraso na oxigenação e variantes mais virulentas. A letalidade global da pandemia foi muito desigual entre países e vagas. Com a imunidade híbrida (vacina + infecção) e as variantes Ómicron, a letalidade desceu, mas a COVID-19 continua a matar pessoas vulneráveis e a gerar long COVID. Uma em cada grupo de doentes graves pode ficar com sequelas respiratórias ou funcionais."),
        memo("Cadeia para decorar: <b>SARS-CoV-2 → COVID-19 → gotículas/aerossóis → RT-PCR confirma → leve/moderada/grave/crítica → oxigénio + suporte + prevenção da trombose → pior prognóstico no idoso com comorbilidades</b>. Anosmia/ageusia são pistas clássicas das primeiras vagas. Antibiótico não é tratamento de rotina."),
        P("Papel do secretário clínico na COVID-19", "mh3"),
    ]
    s += bullets([
        "Organizar filas e circuitos (respiratório / não respiratório) definidos pela direcção.",
        "Registar com exactidão identificação, contactos e data de início dos sintomas.",
        "Não divulgar listas de «positivos».",
        "Apoiar a estatística diária de casos, internamentos e óbitos, com confidencialidade.",
        "Informar o utente sobre documentos e horários — não sobre o «resultado do vizinho».",
    ])
    return s


def cap_cultura():
    s = [
        P("VI. CULTURA GERAL", "mh1"),
        HRule(),
        P("Cultura geral, neste concurso, é sobretudo <b>cultura geral angolana e institucional</b>: geografia, história, símbolos, organização do Estado, saúde pública e actualidade. Segue um compêndio objectivo, no nível esperado para Secretário Clínico."),
        P("1. Geografia física e humana", "mh2"),
    ]
    s += bullets([
        "<b>Área:</b> cerca de 1 246 700 km² (um dos maiores países de África).",
        "<b>Localização:</b> África Austral / Centro-Ocidental; costa atlântica a oeste. Fronteiras: República do Congo e RD Congo a norte (Cabinda é exclave entre os dois Congos), Zâmbia a leste, Namíbia a sul.",
        "<b>Capital:</b> Luanda (província e cidade). Sede da província de Luanda: município da Ingombota, nos termos da nova DPA.",
        "<b>Relevo:</b> orla litoral, planalto central (Huambo, Bié, Huíla), deserto do Namibe a sul-oeste. Ponto culminante clássico: <b>Morro do Moco</b> (Huambo), cerca de 2 620 m.",
        "<b>Rios principais:</b> Kwanza, Cunene, Cubango, Cuando, Zambeze (leste), Zaire/Congo (fronteira norte), Dande, Catumbela.",
        "<b>Clima:</b> tropical, com estação das chuvas e estação seca (cacimbo); árido no Namibe.",
        "<b>Língua oficial:</b> português. Línguas nacionais de grande circulação: umbundo, kimbundu, kikongo, cokwe (tucokwe), nganguela, fiote, kwanyama, nhaneca, entre outras.",
        "<b>Moeda:</b> kwanza (AOA).",
        "<b>Indicativo telefónico:</b> +244.",
        "<b>Densidade média (Censo 2024):</b> cerca de 29 hab./km², com fortíssima concentração no litoral e em Luanda.",
    ])
    s += [
        P("2. Símbolos nacionais e datas cívicas", "mh2"),
    ]
    s += bullets([
        "<b>Bandeira:</b> duas faixas horizontais (vermelho e negro) com engrenagem, estrela e machete amarelos ao centro.",
        "<b>Hino:</b> «Angola Avante».",
        "<b>Armas da República</b> e <b>insígnia</b> previstas na CRA.",
        "<b>11 de Novembro de 1975</b> — Independência Nacional.",
        "<b>4 de Fevereiro de 1961</b> — início da luta armada de libertação (assalto às cadeias de Luanda).",
        "<b>4 de Abril de 2002</b> — Paz efectiva, após a morte de Jonas Savimbi (22 de Fevereiro de 2002) e o Memorando de Entendimento do Luena.",
        "<b>1 de Agosto</b> — Dia das Forças Armadas Angolanas.",
        "<b>17 de Setembro</b> — Dia do Fundador da Nação e do Herói Nacional (nascimento de António Agostinho Neto, 1922).",
        "<b>25 de Maio</b> — Dia de África.",
        "<b>1 de Maio</b> — Dia Internacional do Trabalhador.",
        "<b>25 de Dezembro / 4 de Janeiro</b> — festividades com expressão nacional (consoante o calendário oficial de feriados do ano).",
    ])
    s += [
        P("3. História política — linha essencial", "mh2"),
    ]
    s += bullets([
        "Reinos e Estados pré-coloniais: Kongo, Ndongo e Matamba (Njinga a Mbande), Lunda, Ovimbundu, entre outros.",
        "Colonização portuguesa; Conferência de Berlim (1884–85) e ocupação efectiva tardia do hinterland.",
        "Movimentos de libertação: <b>MPLA</b>, <b>FNLA</b>, <b>UNITA</b>.",
        "Independência: 11/11/1975. Primeiro Presidente: <b>António Agostinho Neto</b> (também poeta — «Sagrada Esperança»).",
        "Após Neto (1979): <b>José Eduardo dos Santos</b> (até 2017).",
        "Guerra civil (1975–2002), com intervalos de acordos (Bicesse 1991, Lusaca 1994) e eleições de 1992.",
        "Constituição de 1975/1992 (sistema semi-presidencialista) substituída pela <b>Constituição de 2010</b> (sistema presidencialista de matriz própria: o Presidente é o Titular do Poder Executivo, eleito como cabeça de lista do partido mais votado). Primeira revisão: <b>Lei n.º 18/21</b>.",
        "Presidente actual: <b>João Manuel Gonçalves Lourenço</b> (desde 2017; reeleito em 2022).",
        "Assembleia Nacional: órgão legislativo unicameral.",
        "Poder judicial: Tribunal Constitucional, Tribunal Supremo, Tribunal de Contas, Supremo Tribunal Militar, tribunais comuns.",
    ])
    s += [
        P("4. Organização do Estado (para cultura geral de prova)", "mh2"),
        P("Angola é uma República soberana e independente, Estado de Direito Democrático, unitário, com descentralização e desconcentração. Órgãos de soberania previstos na CRA incluem o Presidente da República, a Assembleia Nacional e os Tribunais. O Poder Executivo é exercido pelo Presidente, coadjuvado pelo Vice-Presidente e pelos Ministros de Estado e Ministros. Não há «Primeiro-Ministro» no desenho da CRA de 2010 (havia-o na ordem constitucional anterior)."),
        P("5. Economia e inserção internacional", "mh2"),
    ]
    s += bullets([
        "Economia fortemente dependente do <b>petróleo</b> e dos <b>diamantes</b>; esforços de diversificação (agricultura, pescas, minerais, turismo, indústria ligeira).",
        "Membro da <b>ONU</b>, <b>União Africana</b>, <b>SADC</b>, <b>CPLP</b>, <b>OPEP</b> (regresso/participação no quadro petrolífero internacional), <b>CIMEIRA África-América do Sul</b> e outros foros.",
        "Parceiros tradicionais: Portugal, China, Brasil, EUA, países da SADC e da UE.",
        "OGE — Orçamento Geral do Estado: instrumento anual de política económica.",
    ])
    s += [
        P("6. Sistema de saúde — o essencial para o candidato do MINSA", "mh2"),
    ]
    s += bullets([
        "O direito à saúde está consagrado na CRA. O Estado promove o acesso universal e equitativo.",
        "<b>SNS</b> — rede pública de prestadores, organizada por níveis: primário (postos e centros de saúde, municípios), secundário (hospitais gerais / municipais e provinciais) e terciário (hospitais nacionais e especializados).",
        "Programas prioritários clássicos: vacinação (PAV), saúde materno-infantil, paludismo, VIH/SIDA, tuberculose, doenças não transmissíveis, água e saneamento, nutrição.",
        "Paludismo continua a ser uma das principais causas de morbimortalidade.",
        "Documentos de planeamento: Plano Nacional de Desenvolvimento (PND 2023–2027) e instrumentos sanitários nacionais (PNDS e sucedâneos).",
        "O secretário clínico é peça do nível de prestação: sem arquivo e sem acolhimento, o direito à saúde falha na prática.",
    ])
    s += [
        P("7. Personalidades e cultura", "mh2"),
    ]
    s += bullets([
        "Agostinho Neto, José Eduardo dos Santos, João Lourenço — chefes de Estado.",
        "Njinga a Mbande — resistência dos séculos XVII.",
        "Pepetela, Luandino Vieira, Ondjaki, Ana Paula Tavares, José Eduardo Agualusa — letras.",
        "Várias expressões musicais: semba, kizomba, kuduro; figuras como Ngola Ritmos, Bonga, Waldemar Bastos.",
        "Património: Cidade Velha de Mbanza Kongo (Património Mundial da UNESCO).",
    ])
    s += [
        P("8. Mini-perguntas de cultura (treino rápido)", "mh2"),
        q(16, "A independência de Angola foi proclamada em:", [
            ("A", "4 de Fevereiro de 1961"),
            ("B", "11 de Novembro de 1975"),
            ("C", "4 de Abril de 2002"),
            ("D", "5 de Fevereiro de 2010"),
            ("E", "11 de Novembro de 1974"),
        ]),
        Spacer(1, 5),
        q(17, "O hino nacional de Angola é:", [
            ("A", "A Portuguesa"),
            ("B", "Nkosi Sikelel' iAfrika"),
            ("C", "Angola Avante"),
            ("D", "Sagrada Esperança"),
            ("E", "Independência Total"),
        ]),
        Spacer(1, 5),
        q(18, "Mbanza Kongo, Património da UNESCO, situa-se na província de:", [
            ("A", "Uíge"), ("B", "Bengo"), ("C", "Cabinda"), ("D", "Zaire"), ("E", "Malange"),
        ]),
        Spacer(1, 6),
        memo("Datas de ouro: <b>4/02/1961</b> luta armada; <b>11/11/1975</b> independência; <b>4/04/2002</b> paz; <b>2010</b> Constituição vigente; <b>2017</b> João Lourenço; <b>2024/2025</b> Censo definitivo e nova DPA em vigor."),
    ]
    return s


def cap_dpa():
    s = [
        P("VII. DIVISÃO POLÍTICO-ADMINISTRATIVA DE ANGOLA (2024)", "mh1"),
        HRule(),
        P("a) Províncias, municípios e comunas", "mh2"),
        P("A República de Angola organiza o território em <b>províncias</b>, estas em <b>municípios</b> e estes em <b>comunas</b> (podendo existir ainda outras figuras de organização urbana, conforme a lei). Com a reforma da DPA aprovada em 2024 e entrada em vigor em <b>1 de Janeiro de 2025</b>, o país passou a ter:"),
        memo("Números oficiais da nova DPA: <b>21 províncias</b>, <b>326 municípios</b> e <b>378 comunas</b>. Antes: <b>18 províncias</b> e <b>164 municípios</b>. Diploma de referência: <b>Lei n.º 14/24, de 5 de Setembro</b>, sobre a divisão político-administrativa. Superfície nacional: cerca de <b>1 246 700 km²</b>."),
        P("Cada província é dirigida por um <b>Governador Provincial</b> (nomeado no quadro do Poder Executivo). O município é dirigido pela <b>Administração Municipal</b>. A comuna é a unidade de maior proximidade em muita da área rural. A implementação da DPA extinguiu a figura dos <b>distritos urbanos</b> como escalão autónomo, mantendo municípios e comunas (algumas «comunas orgânicas»)."),
        P("Quadro das 21 províncias (sede, população do Censo 2024 e origem)", "mh3"),
    ]
    provs = [
        ["Bengo", "Dande (Caxito)", "716 335", "Mantida"],
        ["Benguela", "Benguela", "2 597 638", "Mantida"],
        ["Bié", "Cuito", "2 264 874", "Mantida"],
        ["Cabinda", "Cabinda", "903 370", "Mantida (exclave)"],
        ["Cuando", "Mavinga", "138 770", "NOVA (ex-Cuando Cubango)"],
        ["Cuanza Norte", "Cazengo (N'dalatando)", "659 097", "Mantida"],
        ["Cuanza Sul", "Sumbe", "2 327 981", "Mantida"],
        ["Cubango", "Menongue", "570 447", "NOVA designação (ex-Cuando Cubango)"],
        ["Cunene", "Cuanhama (Ondjiva)", "1 806 417", "Mantida"],
        ["Huambo", "Huambo", "2 691 902", "Mantida"],
        ["Huíla", "Lubango", "3 302 866", "Mantida"],
        ["Icolo e Bengo", "Catete", "1 372 670", "NOVA (ex-Luanda)"],
        ["Luanda", "Luanda (Ingombota)", "8 816 297", "Redesenhada"],
        ["Lunda Norte", "Dundo", "1 742 217", "Mantida"],
        ["Lunda Sul", "Saurimo", "893 936", "Mantida"],
        ["Malanje", "Malanje", "1 298 250", "Mantida"],
        ["Moxico", "Luena", "574 253", "Redesenhada"],
        ["Moxico Leste", "Cazombo", "411 074", "NOVA (ex-Moxico)"],
        ["Namibe", "Moçâmedes", "815 708", "Mantida"],
        ["Uíge", "Uíge", "2 017 921", "Mantida"],
        ["Zaire", "Mbanza Kongo", "682 658", "Mantida"],
    ]
    s.append(table(["Província", "Sede", "Pop. 2024", "Nota DPA"], provs,
                   [38 * mm, 48 * mm, 32 * mm, 55 * mm]))
    s.append(P("Quadro 6 — 21 províncias, sedes e população residente (INE, Resultados Definitivos do RGPH 2024). Totais oficiais: 36 604 681 habitantes.", "mcaption"))
    s += [
        P("A soma das populações do Quadro 6 reproduz o total nacional. Luanda concentra <b>24,1%</b> dos residentes. Seguem-se Huíla (9,0%), Huambo (7,4%), Benguela (7,1%), Cuanza Sul (6,4%) e Bié (6,2%): estas províncias, com Luanda, concentram cerca de 60% da população. A menos populosa é o <b>Cuando</b> (138 770; 0,4%)."),
        P("b) Criação de novas províncias e municípios", "mh2"),
        P("A Assembleia Nacional aprovou em Agosto de 2024 a nova divisão; a lei foi promulgada e publicada como Lei n.º 14/24, de 5 de Setembro. Objectivos declarados: adequar o mapa ao crescimento demográfico e das infra-estruturas; aproximar serviços e centros de decisão dos cidadãos; clarificar limites; reduzir assimetrias; promover o desenvolvimento harmonioso."),
        P("Três novas províncias"),
    ]
    novas = [
        ["Icolo e Bengo", "Província de Luanda", "Catete", "1 372 670", "Desanexação da coroa periurbana / histórica de Luanda (Ícolo e Bengo)."],
        ["Cuando", "Cuando Cubango", "Mavinga", "138 770", "Parte leste/sudeste do antigo Cuando Cubango."],
        ["Moxico Leste", "Moxico", "Cazombo", "411 074", "Leste do Moxico (alto Zambeze). Em debates iniciais surgiu a designação «Cassai Zambeze»."],
    ]
    s.append(table(["Nova província", "Origem", "Sede", "Pop. 2024", "Nota"], novas,
                   [32 * mm, 32 * mm, 26 * mm, 24 * mm, 59 * mm]))
    s.append(P("Quadro 7 — As três províncias criadas na reforma de 2024/2025.", "mcaption"))
    s += [
        P("O antigo <b>Cuando Cubango</b> deu origem a <b>Cuando</b> (sede Mavinga) e <b>Cubango</b> (sede Menongue). O aumento de municípios (de 164 para 326) resultou sobretudo da <b>elevação de comunas e distritos a município</b> (+162). A média projectada é da ordem de 15 municípios e 18 comunas por província, embora a distribuição real não seja uniforme (Malanje e Uíge, por exemplo, têm malha mais densa)."),
        atencao("Na prova, não use o mapa de 18 províncias. «Cuando Cubango» deixou de ser uma única província. Não escreva «Icole» — a grafia oficial corrente é <b>Icolo e Bengo</b> (também surge «Ícolo e Bengo»). A sede é <b>Catete</b>, não Viana nem Cacuaco. A sede do Cuando é <b>Mavinga</b>, não Menongue."),
        P("c) Impacto da divisão administrativa na gestão dos serviços de saúde", "mh2"),
        P("Para o MINSA e para o secretário clínico, a DPA não é um mapa de geografia: é uma <b>mudança da arquitectura de gestão</b>."),
    ]
    s += bullets([
        "<b>Aproximação dos serviços.</b> Mais municípios significam mais administrações e, potencialmente, mais unidades de referência municipal, postos de recolha estatística e pontos de atendimento. O cidadão deixa de percorrer dezenas de quilómetros para um acto administrativo de saúde.",
        "<b>Novos Gabinetes Provinciais de Saúde.</b> Icolo e Bengo, Cuando e Moxico Leste precisam de estrutura sanitária própria: direcção, depósito de medicamentos, cadeia de frio, vigilância epidemiológica e recursos humanos. O concurso de ingresso externo responde, em parte, a esse défice.",
        "<b>Redistribuição de recursos humanos e do OGE.</b> O Orçamento passa a dotar 21 províncias. Hospitais que eram «do interior de Luanda» podem passar à tutela de Icolo e Bengo; o mesmo no leste do Moxico e no Cuando.",
        "<b>Sistemas de informação.</b> Mapas estatísticos, códigos geográficos (geocódigos do INE), referência e contra-referência, e o ficheiro do utente têm de ser actualizados. Um processo clínico «de Luanda» pode ter de ser reclassificado territorialmente.",
        "<b>Vigilância epidemiológica e campanhas.</b> Paludismo, sarampo, cólera e vacinação organizam-se por território. Fronteiras novas exigem coordenação para não criar «zonas cinzentas» sem responsabilidade clara.",
        "<b>Equidade.</b> A DPA pretende reduzir assimetrias. Sem profissionais, medicamentos e transporte, o novo município é só um nome. Daí a relevância do concurso público e da lotação nas províncias com maior défice.",
        "<b>Risco de transição.</b> Duplicação de arquivos, perda de séries estatísticas, dúvidas sobre a tutela de unidades e atraso na instalação de serviços. O secretário clínico deve perguntar, por escrito se preciso, qual é a tutela actual da unidade e manter o arquivo íntegro durante a transição.",
    ])
    s.append(dica(
        "Pergunta típica: «Qual é a sede de Icolo e Bengo?» → Catete. "
        "«Quantos municípios tem Angola após a Lei n.º 14/24?» → 326. "
        "«Que impacto tem a DPA na saúde?» → aproximação dos serviços, novos GPS, redistribuição de RH e do OGE, actualização dos sistemas de informação, risco de vazios na transição."
    ))
    return s


def cap_censo():
    s = [
        P("VIII. CENSO POPULACIONAL DE ANGOLA 2024", "mh1"),
        HRule(),
        P("O Recenseamento Geral da População e Habitação (RGPH) 2024 foi realizado pelo <b>Instituto Nacional de Estatística (INE)</b>, dez anos após o Censo de 2014. Os <b>resultados definitivos</b> foram divulgados em 2025. É a fonte oficial da população residente e da habitação."),
        P("a) Objectivos do Censo Geral da População e Habitação", "mh2"),
        P("Um censo é a operação estatística que visa contar, no mesmo período de referência, <b>todas as pessoas residentes</b> e caracterizar os <b>alojamentos</b>. Objectivos principais:"),
    ]
    s += bullets([
        "Determinar o volume, a estrutura (sexo, idade) e a distribuição territorial da população.",
        "Caracterizar os agregados familiares e as condições de habitação.",
        "Produzir a base de amostragem para inquéritos posteriores (IIMS, IDR, emprego, etc.).",
        "Actualizar indicadores para o PND, o OGE, os ODS e as políticas sectoriais (saúde, educação, água, energia, protecção social).",
        "Apoiar o recorte eleitoral, o planeamento urbano e a DPA.",
        "Medir o crescimento intercensitário e as migrações internas (urbano/rural, litoral/interior).",
        "Conhecer o acesso a documentos (registo de nascimento, BI), educação, água, saneamento e energia.",
    ])
    s += [
        P("Princípios clássicos de um censo: <b>universalidade</b> (todos), <b>simultaneidade</b> (mesmo momento de referência), <b>individualidade</b> (cada pessoa é registada) e <b>periodicidade</b> (em regra, de 10 em 10 anos). O recenseador visita o alojamento; a participação é um dever cívico e a informação individual é confidencial."),
        P("b) Principais indicadores demográficos", "mh2"),
    ]
    inds = [
        ["População residente 2024", "36 604 681"],
        ["População 2014", "25 789 024"],
        ["Acréscimo intercensitário", "≈ 10,8 milhões (+42% em 10 anos)"],
        ["Taxa de crescimento médio anual", "3,5%"],
        ["Homens", "17 931 985 (49%)"],
        ["Mulheres", "18 672 696 (51%)"],
        ["Índice de masculinidade", "96 homens / 100 mulheres (era 94 em 2014)"],
        ["Idade média", "23,2 anos (era 20,6 em 2014)"],
        ["População 0–14 anos", "46,3% (ligeira descida face a 2014)"],
        ["Área urbana", "23 991 388 (65,5%)"],
        ["Área rural", "12 613 293 (34,5%)"],
        ["Luanda (peso nacional)", "8 816 297 (24,1%)"],
        ["Densidade média", "≈ 29 hab./km²"],
        ["Tamanho médio do agregado", "3,9 pessoas (era 4,6 em 2014)"],
        ["Alfabetismo (15+ anos)", "72,6% (era 65,6%)"],
        ["Alfabetismo 15–24 anos", "74,9%"],
        ["Nunca frequentou a escola (5+ anos)", "24,2%"],
        ["A frequentar a escola (5+ anos)", "41,1%"],
        ["Taxa líquida no ensino primário (6–11)", "62,1% (era 74,8% em 2014)"],
        ["Taxa líquida no secundário (12–18)", "41,9%"],
        ["Registo de nascimento (total)", "63,0% (era 53,5%)"],
        ["Registo de nascimento (0–4 anos)", "39,2% (era 24,8%)"],
        ["População 5+ com BI", "52,4%"],
        ["Água apropriada para beber (agregados)", "56,0%"],
    ]
    s.append(table(["Indicador (INE / RGPH 2024)", "Valor oficial"], inds, [100 * mm, 73 * mm]))
    s.append(P("Quadro 8 — Indicadores-chave do Censo 2024 (resultados definitivos / relatório-síntese do INE).", "mcaption"))
    s += [
        P("Leitura útil: Angola continua a ser um país <b>muito jovem</b> e em <b>rápido crescimento</b>, cada vez mais <b>urbano</b>, com mais mulheres do que homens, e com progressos no registo civil e no alfabetismo dos adultos. Persistam desigualdades urbano-rurais gritantes: o registo de nascimento é cerca de <b>75,5% no urbano</b> e apenas <b>24,5% no rural</b>; o BI cobre 63% no urbano e 30,9% no rural."),
        P("c) Utilidade dos dados censitários para políticas públicas de saúde", "mh2"),
        P("Sem denominador populacional fiável não há planeamento sanitário sério. O Censo serve para:"),
    ]
    s += bullets([
        "<b>Dimensionar a rede</b> — quantos postos, centros, maternidades e camas por município, à luz da população real e não de estimativas velhas.",
        "<b>Calcular taxas</b> — mortalidade, incidência, cobertura vacinal, partos institucionais: o numerador vem da estatística de saúde; o denominador vem do censo (ou das suas projecções).",
        "<b>Alocar recursos humanos</b> — rácios de médicos, enfermeiros e pessoal de apoio (incluindo secretários clínicos) por 10 000 habitantes.",
        "<b>Programas materno-infantis</b> — o peso dos 0–14 anos (46,3%) impõe prioridade a PAV, nutrição, escolas e pediatria.",
        "<b>Doenças crónicas e geriatria</b> — o ligeiro aumento da idade média antecipa mais hipertensão, diabetes e cancro nas próximas décadas.",
        "<b>Urbanização e saúde ambiental</b> — 65,5% urbanos: paludismo urbano, cólera, resíduos, ar, acidentes de viação, saúde mental.",
        "<b>Iniquidades</b> — cruzar território, sexo e condições de habitação (água 56%) para dirigir campanhas às comunas esquecidas.",
        "<b>Registo civil e saúde</b> — 39,2% das crianças 0–4 com registo: sem certidão, há barreiras ao cartão de vacinas, à escola e à protecção social. O hospital deve articular-se com o registo de nascimentos.",
        "<b>Emergências</b> — estimativas de população para vacinação em massa, cólera ou COVID-19.",
        "<b>Base de amostragem do IIMS</b> — o inquérito de saúde assenta na malha do censo.",
    ])
    s += [
        P("d) Crescimento populacional e distribuição geográfica", "mh2"),
        P("Entre 2014 e 2024 Angola ganhou cerca de <b>10,8 milhões</b> de habitantes (taxa média anual de <b>3,5%</b>), um dos crescimentos mais rápidos do mundo. A transição demográfica está no início: a fecundidade desce (ver IIMS), mas a estrutura ainda é piramidal e o crescimento natural permanece alto."),
        P("A distribuição é <b>muito desigual</b>:"),
    ]
    s += bullets([
        "O litoral e o planalto central concentram a maior parte da população (Luanda, Huíla, Huambo, Benguela, Cuanza Sul, Bié).",
        "O leste e o extremo sudeste são vastos e pouco povoados (Cuando, Moxico Leste, Cubango, Moxico).",
        "Cerca de <b>24%</b> da população vive nos dez municípios mais populosos (Kilamba Kiaxi, Cacuaco, Lubango, Viana, Huambo, Cazenga, Maianga, Camama, entre outros), numa fracção mínima do território.",
        "Icolo e Bengo, com 1,37 milhões de habitantes, nasce já como província de peso intermédio, o que pressiona de imediato a rede de saúde periurbana de Luanda.",
        "A descida do tamanho do agregado (4,6 → 3,9) sugere mudanças nos arranjos familiares urbanos.",
    ])
    s.append(lei(
        "Produtor oficial: INE. Documentos de estudo: Relatório dos Resultados Definitivos do RGPH 2024 e Relatório-Síntese. "
        "Na prova, privilegie sempre o número do INE (36 604 681) e não estimativas extra-oficiais da ONU ou da imprensa."
    ))
    return s


def cap_iims():
    s = [
        P("IX. INQUÉRITO DE INDICADORES MÚLTIPLOS E DE SAÚDE (IIMS 2023–2024)", "mh1"),
        HRule(),
        P("O IIMS é o grande inquérito amostral de saúde e demografia de Angola. A edição 2023–2024 é a <b>segunda</b> (a primeira foi 2015–2016). Foi realizado pelo INE em colaboração com o MINSA, com assistência técnica do programa DHS (ICF) e do UNICEF, inserindo-se no 8.º ciclo DHS e no 6.º ciclo MICS. Trabalho de campo: Setembro de 2023 a Janeiro de 2024 (cerca de seis meses; dezenas de equipas no território). Resultados apresentados em 2025."),
        P("a) Objectivos do IIMS", "mh2"),
    ]
    s += bullets([
        "Disponibilizar indicadores sociodemográficos e de saúde actualizados e comparáveis internacionalmente.",
        "Conhecer níveis e tendências da <b>fecundidade</b> e da <b>mortalidade</b> infantil, infanto-juvenil e materna, e os seus determinantes.",
        "Medir conhecimento e uso de <b>contracepção</b> e a necessidade insatisfeita de planeamento familiar.",
        "Recolher dados de <b>saúde materna</b>: pré-natal, parto, pós-parto, aleitamento.",
        "Avaliar <b>imunização</b>, nutrição, IRA, diarreia, febre e desenvolvimento da primeira infância.",
        "Produzir informação sobre <b>VIH/SIDA</b> (conhecimentos, testagem, estigma) e outras IST.",
        "Caracterizar água, saneamento, higiene, paludismo (mosquiteiros), violência doméstica e mortalidade adulta.",
        "Apoiar a monitorização dos <b>ODS</b>, do PND 2023–2027 e do planeamento sanitário nacional.",
        "Fornecer desagregação por província, área de residência, sexo, escolaridade e quintil de riqueza — essencial para a equidade.",
    ])
    s.append(dica(
        "Censo conta <b>toda</b> a população (universo). IIMS entrevista uma <b>amostra</b> representativa, com questionários longos de saúde. "
        "O Censo dá o denominador e o retrato habitacional; o IIMS dá a profundidade sanitária. Ambos se complementam."
    ))
    s += [
        P("b) Indicadores de saúde materno-infantil", "mh2"),
    ]
    mat = [
        ["Taxa de mortalidade neonatal", "16 / 1 000 nados-vivos", "24 → 16"],
        ["Taxa de mortalidade infantil (< 1 ano)", "32 / 1 000", "44 → 32"],
        ["Taxa de mortalidade infanto-juvenil (< 5 anos)", "52 / 1 000", "68 → 52"],
        ["Leitura do INE / estudo", "1 em cada 19 crianças não chega aos 5 anos", "Melhoria, ainda grave"],
        ["Razão de mortalidade materna", "170 / 100 000 nados-vivos", "Indicador ODS 3.1.1"],
        ["Partos assistidos por profissional qualificado", "49,8%", "Ainda metade sem assistência qualificada"],
        ["Consultas pré-natais por profissional qualificado", "≈ 77%", "Desceu face a ≈ 81% em 2015–16"],
        ["Fecundidade (TGF)", "cerca de 5,5 filhos/mulher (tendência decrescente)", "Era mais alta em 2015–16"],
    ]
    s.append(table(["Indicador", "IIMS 2023–2024", "Nota / tendência"], mat, [62 * mm, 62 * mm, 49 * mm]))
    s.append(P("Quadro 9 — Saúde materno-infantil (relatório preliminar/final IIMS e comunicações oficiais do INE).", "mcaption"))
    s += [
        P("A descida da mortalidade infantil é o principal êxito sanitário da década. Porém, <b>menos de metade dos partos</b> tem profissional qualificado e o pré-natal qualificado recuou alguns pontos — sinal de tensão na rede de cuidados primários, sobretudo no rural."),
        P("c) Nutrição, vacinação e mortalidade", "mh2"),
        P("Nutrição (menores de 5 anos)"),
    ]
    nut = [
        ["Desnutrição crónica (baixa altura/idade)", "40%", "38% → 40% (piorou)"],
        ["Desnutrição crónica rural / urbana", "51% / 31%", "Forte iniquidade"],
        ["Piores províncias (crónica)", "Bié 56%; Cuanza Sul 53%; Uíge 48%; Huambo e Huíla 47%", "Luanda a mais baixa (24%)"],
        ["Baixo peso", "21%", "19% → 21% (piorou)"],
        ["Desnutrição aguda (emaciação)", "5%", "Estável"],
        ["Aleitamento materno exclusivo (< 6 meses)", "cerca de 38%", "Ainda longe da meta OMS (50–70%)"],
    ]
    s.append(table(["Indicador nutricional", "Valor", "Leitura"], nut, [62 * mm, 48 * mm, 63 * mm]))
    s.append(P("Quadro 10 — Nutrição infantil no IIMS 2023–2024.", "mcaption"))
    s += [
        P("Vacinação"),
        P("A cobertura mantém-se baixa e desigual. Sínteses do inquérito apontam, entre crianças elegíveis:"),
    ]
    s += bullets([
        "Apenas cerca de <b>29%</b> das crianças de 12–23 meses receberam todos os antigénios básicos (com variações provinciais extremas: valores muito baixos no Moxico em fichas regionais).",
        "DPT 3.ª dose na ordem dos <b>41%</b> (síntese de quadros do relatório).",
        "Sarampo-rubéola 2.ª dose na ordem dos <b>33%</b>.",
        "Vacina pneumocócica (última dose do programa) na ordem dos <b>36%</b>.",
        "A quebra da cobertura explica surtos de sarampo e a persistência da mortalidade evitável.",
    ])
    s += [
        P("Mortalidade — o que decorar"),
        P("Três números em cascata: <b>16 — 32 — 52</b> (neonatal, infantil, infanto-juvenil, por 1 000). Materna: <b>170</b> por 100 000. A melhoria da sobrevivência infantil convive com o agravamento da desnutrição crónica: as crianças morrem menos, mas muitas crescem mal (stunting), o que comprometerá escola, trabalho e saúde de adultos."),
        P("d) Uso dos dados do IIMS no planeamento sanitário", "mh2"),
    ]
    s += bullets([
        "<b>Priorização geográfica.</b> Concentrar recursos de nutrição no Bié, Cuanza Sul, Uíge, Huambo e Huíla; reforçar partos qualificados no rural; não desinvestir Luanda (volume absoluto enorme).",
        "<b>PAV.</b> Redesenhar microplanos de vacinação onde a cobertura de antigénios básicos é inferior a 1/3.",
        "<b>Rede materna.</b> Se só 49,8% dos partos são qualificados, faltam salas de parto, ambulâncias, enfermeiros de saúde materna e casas de espera.",
        "<b>Comunicação e extensão.</b> Aleitamento a 38% e pré-natal em recuo exigem agentes de desenvolvimento comunitário e secretarias organizadas nas consultas de criança sã e de pré-natal.",
        "<b>Monitorização do PND e dos ODS</b> (3.1 mortalidade materna, 3.2 infantil, 2.2 malnutrição, 3.7 saúde sexual e reprodutiva).",
        "<b>Formação e lotação.</b> Os dados justificam concursos e a colocação de pessoal de apoio (secretários, estatísticos, maqueiros) nas unidades que alimentam o sistema de informação.",
        "<b>Na secretaria clínica.</b> O IIMS «não se preenche no balcão», mas a qualidade do Boletim de Saúde Infantil, do partograma, do registo de vacinas e da ficha de óbito é o que permite, mais tarde, inquéritos e estatísticas credíveis. Um cartão de vacinas mal preenchido enviesa a cobertura.",
    ])
    s.append(memo(
        "Trio Censo / IIMS / DPA: o Censo diz <b>quantos somos e onde estamos</b>; o IIMS diz <b>de que adoecemos, morremos e como usamos os serviços</b>; a DPA diz <b>quem gere cada pedaço do mapa</b>. "
        "Uma resposta de prova de excelência articula os três."
    ))
    return s


def cap_ia():
    s = [
        P("X. INTELIGÊNCIA ARTIFICIAL (IA)", "mh1"),
        HRule(),
        P("a) Conceito de Inteligência Artificial", "mh2"),
        P("Inteligência Artificial é o campo da informática que desenvolve sistemas capazes de executar tarefas que, se realizadas por humanos, exigiriam inteligência: perceber linguagem, reconhecer imagens, aprender com dados, raciocinar, decidir ou recomendar. Não é «um cérebro electrónico consciente». É, na prática, <b>matemática + dados + poder de cálculo</b>."),
        P("Distinções úteis em prova:"),
    ]
    s += bullets([
        "<b>IA estreita (ANI)</b> — a que existe hoje: faz bem uma família de tarefas (traduzir, classificar uma radiografia, sugerir texto).",
        "<b>IA geral (AGI)</b> — hipótese futura de competência ampla, semelhante à humana; não está disponível.",
        "<b>Aprendizagem automática (machine learning)</b> — o sistema aprende padrões a partir de exemplos, sem ser explicitamente programado para cada regra.",
        "<b>Aprendizagem profunda (deep learning)</b> — redes neuronais artificiais com muitas camadas; base da visão computacional e dos grandes modelos de linguagem.",
        "<b>IA generativa</b> — produz texto, imagem, áudio ou código novos (ex.: modelos de linguagem de grande escala).",
        "<b>Algoritmo</b> — sequência finita de instruções; na IA, muitas vezes treinado e não apenas escrito à mão.",
        "<b>Dado pessoal / dado de saúde</b> — qualquer informação que identifique o doente (nome, BI, prontuário, voz, face, genoma).",
    ])
    s += [
        P("b) Aplicações da IA na saúde", "mh2"),
    ]
    apps = [
        ["Diagnóstico auxiliado", "Leitura de raio-X, TC, retinografia, pele; alerta de tuberculose ou COVID em imagem."],
        ["Triagem e filas", "Sistemas que priorizam urgências com base em sintomas registados na recepção."],
        ["Processo clínico electrónico", "Codificação automática de diagnósticos, sumários de alta, detecção de alergias."],
        ["Secretariado clínico", "Agendamento inteligente, redução de faltas (SMS preditivo), transcrição de voz, atendimento inicial por chatbot institucional."],
        ["Gestão hospitalar", "Previsão de ocupação de camas, stocks de medicamentos e de oxigénio, escalas de pessoal."],
        ["Saúde pública", "Modelos de surto (cólera, paludismo, sarampo), análise de redes sociais para rumores, apoio ao PAV."],
        ["Investigação e formação", "Descoberta de fármacos, simulação, tutoria para profissionais."],
        ["Acessibilidade", "Tradução português–línguas nacionais, leitura em voz alta para analfabetos, apoio a deficientes visuais."],
    ]
    s.append(table(["Domínio", "Exemplo concreto"], apps, [48 * mm, 125 * mm]))
    s.append(P("Quadro 11 — Aplicações da IA com relevância para o SNS e para a secretaria.", "mcaption"))
    s += [
        P("c) Benefícios e riscos da IA no sector público", "mh2"),
        P("Benefícios"),
    ]
    s += bullets([
        "Ganho de tempo em tarefas repetitivas (marcação, arquivo, relatórios).",
        "Apoio à decisão clínica e administrativa em contextos com poucos especialistas.",
        "Possível redução de erros de transcrição e de extravio.",
        "Melhor planeamento (prever picos de paludismo ou de partos).",
        "Ampliação do acesso a informação em português simples.",
        "Transparência potencial: rasto digital de quem acedeu ao processo.",
    ])
    s += [
        P("Riscos"),
    ]
    s += bullets([
        "<b>Enviesamento (bias)</b> — se o sistema foi treinado com dados de outro país ou só de Luanda, pode falhar no Cuando ou em crianças desnutridas.",
        "<b>Alucinação</b> — a IA generativa inventa referências, doses ou leis com tom convincente.",
        "<b>Opacidade</b> — «caixa negra»: difícil explicar ao utente por que foi recusada uma vaga.",
        "<b>Desqualificação profissional</b> — o funcionário deixa de verificar e assina o que a máquina escreveu.",
        "<b>Exclusão digital</b> — idosos, rurais e analfabetos ficam de fora se o único canal for uma aplicação.",
        "<b>Cibersegurança e fuga de dados</b> — um hospital é alvo valioso; um USB ou um grupo de WhatsApp bastam para vazar mil processos.",
        "<b>Dependência de fornecedores</b> — software estrangeiro, custos, perda de soberania sobre dados de saúde da Nação.",
        "<b>Vigilância e abuso</b> — uso de reconhecimento facial ou de dados de saúde para fins alheios ao cuidado.",
        "<b>Responsabilidade</b> — quem responde se o algoritmo errar: o médico, o secretário, o MINSA ou a empresa?",
    ])
    s += [
        P("d) Ética e protecção de dados", "mh2"),
        P("Princípios éticos de referência (UNESCO, OMS e boa prática de administração):"),
    ]
    s += bullets([
        "<b>Dignidade humana e autonomia</b> — a máquina auxilia; não substitui o consentimento do doente nem a responsabilidade do profissional.",
        "<b>Beneficência e não-maleficência</b> — só implantar sistemas que comprovadamente ajudem e não prejudiquem.",
        "<b>Justiça e não discriminação</b> — testar o sistema nas 21 províncias e nos grupos vulneráveis.",
        "<b>Transparência e explicabilidade</b> — o utente deve saber que está a falar com um sistema automático.",
        "<b>Responsabilidade e auditoria</b> — rasto de decisões; supervisão humana obrigatória em actos que afectem direitos.",
        "<b>Privacidade e minimização</b> — recolher só os dados necessários, pelo tempo necessário, com acesso restrito.",
        "<b>Segurança e robustez</b> — copias de segurança, palavras-passe, actualizações, formação.",
        "<b>Soberania e interesse público</b> — dados de saúde angolanos são património sensível; contratos devem impedir o treino livre de modelos comerciais com prontuários do SNS.",
    ])
    s += [
        lei("Em Angola, o dever de proteger dados pessoais dos cidadãos está expresso na <b>Lei n.º 26/22, art. 7.º, alínea b)</b>, e na legislação específica de protecção de dados (referência clássica: <b>Lei n.º 22/11, de 17 de Junho</b> — Protecção de Dados Pessoais), além do sigilo profissional e da Pauta Deontológica (reserva e discrição). "
            "Dados de saúde são dados <b>sensíveis</b>: exigem base legal, finalidade clara e medidas de segurança reforçadas."),
        P("Regras práticas para o secretário clínico (decore e aplique)"),
    ]
    s += bullets([
        "Não colar dados de doentes em ChatGPT, WhatsApp ou e-mail pessoal «para redigir mais depressa».",
        "Não fotografar o ecrã do processo clínico.",
        "Bloquear o computador ao ausentar-se do balcão.",
        "Não partilhar senhas; não usar a mesma senha do Facebook no sistema hospitalar.",
        "Confirmar a identidade de quem pede informações (o «primo» no telefone pode não o ser).",
        "Se a instituição adoptar um chatbot, o cidadão deve poder falar com um humano.",
        "Qualquer ferramenta de IA deve ser autorizada pela direcção e cumprir o regulamento interno.",
        "Erros da máquina são erros do serviço se ninguém os validar — o dever de zelo mantém-se.",
    ])
    s.append(atencao(
        "A IA não revoga a Pauta Deontológica. Imparcialidade, sigilo, parcimónia e legalidade aplicam-se ao algoritmo como ao funcionário. "
        "Um sistema que marca consultas primeiro para quem paga «gásosa digital» é improbidade automatizada."
    ))
    return s


def cap_bateria():
    s = [
        P("BATERIA DE QUESTÕES TIPO PROVA", "mh1"),
        HRule(),
        P("Simulado misto de 40 itens, no estilo de escolha múltipla. Tempo sugerido: <b>70 minutos</b>. Não consulte o manual. A chave comentada está no capítulo seguinte. As questões 1–7 (verbal) e 8–18 (numérico/cultura já apresentadas) continuam a contar; abaixo seguem itens novos, numerados a partir de 19, cobrindo todo o programa."),
        q(19, "A Administração Pública angolana, nos termos do art. 198.º-A da CRA, integra:", [
            ("A", "Apenas os ministérios sediados em Luanda."),
            ("B", "Somente a Administração Directa do Estado."),
            ("C", "A Administração Directa e Indirecta do Estado, a Autónoma e a Independente."),
            ("D", "Os partidos políticos e as igrejas."),
            ("E", "Apenas os governos provinciais."),
        ]),
        Spacer(1, 5),
        q(20, "Desconcentração administrativa significa, em síntese:", [
            ("A", "Criar um Estado federal."),
            ("B", "Repartir competências por órgãos do próprio Estado, mantendo a unidade da pessoa colectiva."),
            ("C", "Privatizar hospitais."),
            ("D", "Transferir soberania para a União Africana."),
            ("E", "Extinguir municípios."),
        ]),
        Spacer(1, 5),
        q(21, "A Lei de Bases da Função Pública em vigor é a:", [
            ("A", "Lei n.º 17/90, de 20 de Outubro."),
            ("B", "Lei n.º 26/22, de 22 de Agosto."),
            ("C", "Lei n.º 14/24, de 5 de Setembro."),
            ("D", "Resolução n.º 27/94, de 26 de Agosto."),
            ("E", "Lei n.º 3/10, de 29 de Março."),
        ]),
        Spacer(1, 5),
        q(22, "A nomeação, na Lei n.º 26/22:", [
            ("A", "É proibida no sector da saúde."),
            ("B", "É a regra de ingresso na Função Pública."),
            ("C", "Substituiu definitivamente o concurso público."),
            ("D", "Aplica-se só a ministros."),
            ("E", "É sinónimo de contrato de trabalho público."),
        ]),
        Spacer(1, 5),
        q(23, "A Pauta Deontológica do Serviço Público foi aprovada pela:", [
            ("A", "Lei n.º 26/22."),
            ("B", "Constituição de 2010."),
            ("C", "Resolução n.º 27/94, de 26 de Agosto."),
            ("D", "Lei n.º 14/24."),
            ("E", "Decreto presidencial do MINSA de 2026."),
        ]),
        Spacer(1, 5),
        q(24, "Aceitar dinheiro de um utente para antecipar uma consulta fere, em primeiro lugar, o dever de:", [
            ("A", "Pontualidade."),
            ("B", "Assiduidade."),
            ("C", "Probidade."),
            ("D", "Autoformação."),
            ("E", "Motivação do acto administrativo."),
        ]),
        Spacer(1, 5),
        q(25, "Comentar o diagnóstico de um doente num candongueiro viola sobretudo:", [
            ("A", "O dever de parcimónia."),
            ("B", "O dever de discrição / protecção de dados e o sigilo."),
            ("C", "O dever de respeito aos símbolos nacionais."),
            ("D", "O princípio da desconcentração."),
            ("E", "O direito à greve."),
        ]),
        Spacer(1, 5),
        q(26, "Não existe dever de obediência quando a ordem do superior:", [
            ("A", "É verbal e não escrita."),
            ("B", "É dada depois das 15 horas."),
            ("C", "Implica a prática de um crime."),
            ("D", "Desagrada politicamente ao funcionário."),
            ("E", "Aumenta o volume de trabalho."),
        ]),
        Spacer(1, 5),
        q(27, "O agente etiológico da COVID-19 é:", [
            ("A", "O vírus da gripe A (H1N1)."),
            ("B", "O bacilo de Koch."),
            ("C", "O SARS-CoV-2."),
            ("D", "O VIH-1."),
            ("E", "O Plasmodium falciparum."),
        ]),
        Spacer(1, 5),
        q(28, "O teste considerado padrão de referência para confirmar a infecção aguda por SARS-CoV-2 é:", [
            ("A", "A serologia IgG isolada."),
            ("B", "A radiografia dos seios perinasais."),
            ("C", "O RT-PCR em amostra respiratória."),
            ("D", "A glicemia em jejum."),
            ("E", "O teste cutâneo de Mantoux."),
        ]),
        Spacer(1, 5),
        q(29, "Anosmia e ageusia, no contexto da COVID-19, designam:", [
            ("A", "Febre e tosse."),
            ("B", "Perda de olfacto e de paladar."),
            ("C", "Diarreia e vómitos."),
            ("D", "Icterícia e prurido."),
            ("E", "Incontinência e retenção urinária."),
        ]),
        Spacer(1, 5),
        q(30, "Após a Lei n.º 14/24, Angola passou a ter:", [
            ("A", "18 províncias e 164 municípios."),
            ("B", "20 províncias e 200 municípios."),
            ("C", "21 províncias, 326 municípios e 378 comunas."),
            ("D", "21 províncias e 164 municípios."),
            ("E", "24 províncias e 378 municípios."),
        ]),
        Spacer(1, 5),
        q(31, "A sede da província de Icolo e Bengo é:", [
            ("A", "Viana"), ("B", "Cacuaco"), ("C", "Catete"), ("D", "Caxito"), ("E", "Dande"),
        ]),
        Spacer(1, 5),
        q(32, "A província do Cuando tem sede em:", [
            ("A", "Menongue"), ("B", "Mavinga"), ("C", "Cuito Cuanavale"), ("D", "Luena"), ("E", "Cazombo"),
        ]),
        Spacer(1, 5),
        q(33, "A nova província que resulta da divisão do Moxico é:", [
            ("A", "Lunda Sul"), ("B", "Cubango"), ("C", "Moxico Leste"), ("D", "Icolo e Bengo"), ("E", "Cuando"),
        ]),
        Spacer(1, 5),
        q(34, "Segundo os resultados definitivos do Censo 2024, a população residente de Angola é de:", [
            ("A", "25 789 024 habitantes."),
            ("B", "30 000 000 habitantes."),
            ("C", "36 604 681 habitantes."),
            ("D", "40 112 008 habitantes."),
            ("E", "8 816 297 habitantes."),
        ]),
        Spacer(1, 5),
        q(35, "A taxa de crescimento médio anual intercensitária 2014–2024 anunciada pelo INE é de:", [
            ("A", "1,1%"), ("B", "2,0%"), ("C", "3,5%"), ("D", "5,2%"), ("E", "10,8%"),
        ]),
        Spacer(1, 5),
        q(36, "No Censo 2024, a população urbana representa cerca de:", [
            ("A", "34,5%"), ("B", "46,3%"), ("C", "51%"), ("D", "65,5%"), ("E", "90%"),
        ]),
        Spacer(1, 5),
        q(37, "A província mais populosa e a menos populosa, respectivamente, são:", [
            ("A", "Huíla e Namibe"),
            ("B", "Luanda e Cuando"),
            ("C", "Luanda e Cabinda"),
            ("D", "Huambo e Moxico Leste"),
            ("E", "Benguela e Bengo"),
        ]),
        Spacer(1, 5),
        q(38, "No IIMS 2023–2024, a taxa de mortalidade infantil é de:", [
            ("A", "16 por 1 000 nados-vivos"),
            ("B", "32 por 1 000 nados-vivos"),
            ("C", "52 por 1 000 nados-vivos"),
            ("D", "170 por 1 000 nados-vivos"),
            ("E", "40 por 1 000 nados-vivos"),
        ]),
        Spacer(1, 5),
        q(39, "A desnutrição crónica em menores de 5 anos, no IIMS 2023–2024, situa-se em cerca de:", [
            ("A", "5%"), ("B", "21%"), ("C", "32%"), ("D", "40%"), ("E", "70%"),
        ]),
        Spacer(1, 5),
        q(40, "A percentagem de partos assistidos por profissional de saúde qualificado, no IIMS 2023–2024, é de aproximadamente:", [
            ("A", "19,8%"), ("B", "29%"), ("C", "49,8%"), ("D", "77%"), ("E", "90%"),
        ]),
        Spacer(1, 5),
        q(41, "O IIMS distingue-se do Censo porque:", [
            ("A", "Substitui o Censo de dez em dez anos."),
            ("B", "É um inquérito por amostra, focado em indicadores de saúde e demografia."),
            ("C", "Conta todos os alojamentos do país."),
            ("D", "É realizado exclusivamente pelo MINSA, sem o INE."),
            ("E", "Só cobre Luanda."),
        ]),
        Spacer(1, 5),
        q(42, "Um benefício típico da IA na secretaria clínica é:", [
            ("A", "Eliminar o dever de sigilo."),
            ("B", "Substituir o consentimento do doente."),
            ("C", "Apoiar o agendamento e reduzir tarefas repetitivas, sob supervisão humana."),
            ("D", "Publicar automaticamente os diagnósticos na internet."),
            ("E", "Dispensar a urbanidade no atendimento."),
        ]),
        Spacer(1, 5),
        q(43, "Colar o processo clínico num serviço público de IA generativa, sem autorização, viola principalmente:", [
            ("A", "O dever de pontualidade."),
            ("B", "A protecção de dados pessoais e o sigilo."),
            ("C", "O hino nacional."),
            ("D", "A regra de três simples."),
            ("E", "O princípio da publicidade absoluta."),
        ]),
        Spacer(1, 5),
        q(44, "«Angola Avante» é:", [
            ("A", "O lema da CPLP."),
            ("B", "O hino nacional."),
            ("C", "A moeda nacional."),
            ("D", "O nome da Constituição de 2010."),
            ("E", "A sede do MINSA."),
        ]),
        Spacer(1, 5),
        q(45, "O direito dos administrados a serem ouvidos e informados pela Administração consta, na CRA, do artigo:", [
            ("A", "1.º"), ("B", "21.º"), ("C", "198.º-A"), ("D", "200.º"), ("E", "226.º"),
        ]),
        Spacer(1, 8),
        P("Itens 1–18 (capítulos III, IV e VI) também integram o treino. Some 45 itens no total deste livro."),
    ]
    return s


def cap_chave():
    s = [
        P("FOLHA DE RESPOSTAS E CHAVE COMENTADA", "mh1"),
        HRule(),
    ]
    chave = [
        ["1", "B", "O texto liga prazos e urbanidade; A, C, D e E contradizem-no."],
        ["2", "C", "O processo é da instituição / do doente, não bem particular de quem escreve."],
        ["3", "B", "Relação de antónimos legais/éticos."],
        ["4", "C", "Igualdade de tratamento = imparcialidade."],
        ["5", "C", "Diagnóstico identifica; prognóstico prevê evolução."],
        ["6", "C", "«Salvo» = excepto."],
        ["7", "B", "Pauta = norma de deveres éticos."],
        ["8", "C", "0,30 × 450 = 135."],
        ["9", "D", "200 − 70 + 40 = 170 (35% de 200 = 70)."],
        ["10", "C", "O dobro de pessoas em metade do tempo = mesmo número (400)."],
        ["11", "C", "(18+22+25+19+26)/5 = 110/5 = 22."],
        ["12", "C", "(52−40)/40 = 12/40 = 30%."],
        ["13", "B", "70% de 40 = 28 ocupadas; livres = 12."],
        ["14", "C", "2/(2+5) = 2/7 ≈ 28,6%."],
        ["15", "D", "16 × 12,5 = 200."],
        ["16", "B", "11 de Novembro de 1975."],
        ["17", "C", "Hino oficial."],
        ["18", "D", "Mbanza Kongo fica no Zaire."],
        ["19", "C", "Art. 198.º-A da CRA."],
        ["20", "B", "Desconcentração ≠ descentralização."],
        ["21", "B", "Lei n.º 26/22 revogou a 17/90."],
        ["22", "B", "Art. 10.º: nomeação é a regra."],
        ["23", "C", "Resolução n.º 27/94."],
        ["24", "C", "Vantagem indevida = improbidade / falta de probidade."],
        ["25", "B", "Discrição + dados pessoais + sigilo clínico."],
        ["26", "C", "Ordens criminosas não obrigam."],
        ["27", "C", "SARS-CoV-2 causa COVID-19."],
        ["28", "C", "RT-PCR é o padrão de referência."],
        ["29", "B", "Vocabulário clínico clássico da COVID-19."],
        ["30", "C", "Lei n.º 14/24 / DPA 2025."],
        ["31", "C", "Catete."],
        ["32", "B", "Mavinga (Menongue é do Cubango)."],
        ["33", "C", "Moxico Leste, sede Cazombo."],
        ["34", "C", "36 604 681 (INE)."],
        ["35", "C", "3,5% ao ano."],
        ["36", "D", "65,5% urbana."],
        ["37", "B", "Luanda 8,8 milhões; Cuando 138 770."],
        ["38", "B", "32‰ infantil; 16 neonatal; 52 infanto-juvenil."],
        ["39", "D", "40% (subiu face a 38%)."],
        ["40", "C", "49,8%."],
        ["41", "B", "Inquérito amostral DHS/MICS."],
        ["42", "C", "IA como apoio, não como desculpa ética."],
        ["43", "B", "Dados sensíveis fora do sistema oficial."],
        ["44", "B", "Hino nacional."],
        ["45", "D", "Art. 200.º da CRA."],
    ]
    s.append(table(["N.º", "Chave", "Comentário mínimo"], chave, [16 * mm, 18 * mm, 139 * mm]))
    s.append(P("Quadro 12 — Chave das 45 questões de treino.", "mcaption"))
    s.append(dica(
        "Auto-avaliação: 40–45 certo = preparado; 32–39 = reveja as caixas MEMORIZE; "
        "24–31 = refaça os capítulos I, II, VII, VIII e IX; abaixo de 24 = recomece pelo plano de 14 dias, sem saltar exercícios."
    ))
    return s


def cap_fontes():
    s = [
        P("FONTES E LEGISLAÇÃO DE CONSULTA", "mh1"),
        HRule(),
        P("Consulte sempre o texto oficial no Diário da República ou nos portais do Estado. Este manual é síntese pedagógica."),
        P("Legislação e normas", "mh2"),
    ]
    s += bullets([
        "Constituição da República de Angola (2010), com a revisão da Lei n.º 18/21 — Título V, arts. 198.º a 200.º-A.",
        "Lei n.º 26/22, de 22 de Agosto — Lei de Bases da Função Pública (revoga a Lei n.º 17/90).",
        "Resolução n.º 27/94, de 26 de Agosto — Pauta Deontológica do Serviço Público.",
        "Lei n.º 3/10, de 29 de Março — Lei da Probidade Pública.",
        "Lei n.º 22/11, de 17 de Junho — Protecção de Dados Pessoais.",
        "Lei n.º 14/24, de 5 de Setembro — Divisão político-administrativa (21 províncias, 326 municípios, 378 comunas).",
        "Tópicos do Concurso Público de Ingresso Externo do MINSA (edição em vigor no portal concurso-minsa.ao).",
    ])
    s += [
        P("Estatística e saúde", "mh2"),
    ]
    s += bullets([
        "INE — Resultados Definitivos e Relatório-Síntese do Recenseamento Geral da População e Habitação 2024.",
        "INE / MINSA / DHS / UNICEF — Inquérito de Indicadores Múltiplos e de Saúde (IIMS) 2023–2024 (relatório preliminar e final).",
        "OMS — definições clínicas e de saúde pública da COVID-19; princípios de ética da IA em saúde.",
        "MINSA — protocolos nacionais de COVID-19, PAV e normas de organização hospitalar vigentes.",
        "UNESCO — Recomendação sobre a Ética da Inteligência Artificial (2021).",
    ])
    s += [
        P("Nota final ao candidato", "mh2"),
        P("O Secretário Clínico é, muitas vezes, o primeiro rosto do Serviço Nacional de Saúde. A prova mede se o candidato conhece o Estado que vai servir, a ética que o vincula, o país que o Censo e o IIMS descrevem, e se pensa com clareza — por palavras e por números. Estude com disciplina, chegue pontualmente, leia cada enunciado até ao fim e escolha a opção que a lei e os dados sustentam, não a que «soa mais bonita»."),
        Spacer(1, 8),
        ColorBar(5),
        Spacer(1, 8),
        P("Fim do manual. Bom estudo e boa prova.", "center_ink"),
        P("Edição pedagógica de apoio • 2026 • Conteúdos alinhados aos tópicos oficiais do MINSA para Secretário Clínico.", "mcaption"),
    ]
    return s


def build():
    story = [Spacer(1, 1), PageBreak()]  # capa desenhada no canvas da pág. 1
    # Folha de rosto interior
    story += [
        ColorBar(6),
        Spacer(1, 8),
        P("REPÚBLICA DE ANGOLA", "center_ink"),
        P("<b>MINISTÉRIO DA SAÚDE</b>", "center_ink"),
        P("Direcção Nacional de Recursos Humanos — apoio ao candidato", "mcaption"),
        Spacer(1, 6),
        P("Manual de Apoio ao Estudo", "mh1"),
        P("Concurso Público de Ingresso Externo — Carreira de Apoio Hospitalar", "mbody"),
        P("<b>Categoria: Secretário Clínico</b>", "mbody"),
        Spacer(1, 4),
        HRule(),
        Spacer(1, 6),
        P("Este volume cobre, ponto por ponto, o programa publicado nos tópicos oficiais: organização da Administração Pública; pauta deontológica; raciocínio verbal e numérico; COVID-19; cultura geral; divisão político-administrativa de 2024/2025; Censo 2024; IIMS 2023–2024; e Inteligência Artificial. Inclui quadros de memorização, 45 questões tipo prova e chave comentada."),
        P("Os números demográficos e sanitários reproduzem fontes oficiais do INE e do MINSA disponíveis à data de elaboração (resultados definitivos do RGPH 2024 e IIMS 2023–2024). Se o Ministério publicar rectificação estatística posterior, prevalece o documento oficial."),
        Spacer(1, 6),
        lei("Portal de candidaturas e tópicos: concurso-minsa.ao • sigrh.minsa.gov.ao • info.rh@minsa.gov.ao • Av. 21 de Janeiro, Gamek, Edifício Sede, rés-do-chão, Luanda."),
        PageBreak(),
    ]
    story += toc()
    story.append(PageBreak())
    story += cap_uso()
    story.append(PageBreak())
    story += cap_admin()
    story.append(PageBreak())
    story += cap_deonto()
    story.append(PageBreak())
    story += cap_verbal()
    story.append(PageBreak())
    story += cap_numerico()
    story.append(PageBreak())
    story += cap_covid()
    story.append(PageBreak())
    story += cap_cultura()
    story.append(PageBreak())
    story += cap_dpa()
    story.append(PageBreak())
    story += cap_censo()
    story.append(PageBreak())
    story += cap_iims()
    story.append(PageBreak())
    story += cap_ia()
    story.append(PageBreak())
    story += cap_bateria()
    story.append(PageBreak())
    story += cap_chave()
    story.append(PageBreak())
    story += cap_fontes()
    return story


def first_page(c, doc):
    draw_cover(c, doc)


def later_pages(c, doc):
    header_footer(c, doc)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc = SimpleDocTemplate(
        OUT,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title="Manual de Apoio — Secretário Clínico — Concurso MINSA",
        author="Manual de estudo pedagógico",
        subject="Tópicos oficiais do concurso público de ingresso externo do MINSA",
    )
    doc.build(build(), onFirstPage=first_page, onLaterPages=later_pages)
    print("PDF gerado:", OUT, "bytes:", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
