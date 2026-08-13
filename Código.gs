function doGet(e) {
  // 1. Arquivo HTML no GitHub
  const urlGithub = 'https://g-opec.github.io/gip/gip.html';
  try {
    // 2. Faz a requisição para buscar o conteúdo do arquivo
    const resposta = UrlFetchApp.fetch(urlGithub);
    const conteudoHtml = resposta.getContentText();
    
    // 3. Cria um template usando o texto puro recebido do GitHub
    const template = HtmlService.createTemplate(conteudoHtml);
    
    // 4. Injeta variáveis dinâmicas no template (opcional)
    template.mensagemDoServidor = "Autenticado e rodando perfeitamente!";
    
    // 5. Avalia e retorna a interface para o navegador
    return template.evaluate()
      .setTitle('Gerenciador Inserções Partidarias gip G-opec')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // Permite embedar em iframes
      
  } catch (erro) {
    // Retorno amigável em caso de erro na busca do arquivo
    return HtmlService.createHtmlOutput('<h1>Erro ao carregar a interface</h1><p>' + erro.message + '</p>');
  }
}

// 1. GERENCIAMENTO DE PASTAS
function getListAno(){
const root = DriveApp.getRootFolder();
  let pastaPolitica = root.getFoldersByName("Politica").hasNext() ? root.getFoldersByName("Politica").next() : root.createFolder("Politica");
  let pastasAno = pastaPolitica.getFolders();

  let latestFolder = null;
    const list = [];
    
    // identifica a pasta com o ano mais recente
    while(pastasAno.hasNext()){
       let p = pastasAno.next();
       let name = p.getName();
       
           let match = name.match(/\d{4}/);
           if(match){
               let y = parseInt(match[0]);
               list.push(y)
           }
       }

    list.sort((a, b) => b - a);

    return list;
}
function getOuCriarPastaAno(ano) {
  const pastaPolitica = DriveApp.getFoldersByName("Politica").next();
  
  let pastaAno = pastaPolitica.getFoldersByName(ano.toString()).hasNext() ? pastaPolitica.getFoldersByName(ano.toString()).next() : pastaPolitica.createFolder(ano.toString());
  
  if (!pastaAno.getFoldersByName("arquivos").hasNext()) pastaAno.createFolder("arquivos");
  if (!pastaAno.getFoldersByName("mapas").hasNext()) pastaAno.createFolder("mapas");
  
  return pastaAno;
}

// 2. CARREGAR E SALVAR PROGRAMAÇÃO
// --------------------------------------------------------
// Função para Salvar o CSV Final no Drive (Com nome dinâmico por Ano)
// --------------------------------------------------------
function salvarCSVProgramacao(csvString, ano) {
  try {
    const pastaAno = getOuCriarPastaAno(ano);
    const files = pastaAno.getFilesByName("dados_Programacao.csv");
    
    if (files.hasNext()) {
      const file = files.next();
      file.setContent(csvString);
      return file.getUrl();
    } else {
      const novoArquivo = pastaAno.createFile("dados_Programacao.csv", csvString, MimeType.CSV);
      return novoArquivo.getUrl();
    }
  } catch(e) {
    throw new Error("Erro ao salvar CSV de Política: " + e.message);
  }
}

// --------------------------------------------------------
// Função para Carregar o CSV Final do Drive (Adaptado para Receber Ano)
// --------------------------------------------------------
function carregarCSVProgramacao(anoDesejado) {
  try {
    let ano = anoDesejado;
    if (!ano) {
      const list = getListAno();
      if (list.length === 0) return null; // Se não tem pastas, retorna nulo
      ano = list[0];
    }
    
    const pastaAno = getOuCriarPastaAno(ano);
    const files = pastaAno.getFilesByName("dados_Programacao.csv");
    
    if (files.hasNext()) {
      const file = files.next();
      const csvContent = file.getBlob().getDataAsString();
      return Utilities.parseCsv(csvContent, ";");
    }
    return null;
  } catch (e) {
    if (typeof registrarErroSistema === "function") registrarErroSistema('carregarCSVProgramacao', e.message);
    throw new Error("Erro ao carregar dados: " + e.message);
  }
}

// 3. GERENCIAR JSON DE MATERIAIS E UPLOAD DE MÍDIA
function getJsonMateriais(pastaArquivos) {
  const files = pastaArquivos.getFilesByName("materiais.json");
  if (files.hasNext()) {
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    return content ? JSON.parse(content) : [];
  } else {
    pastaArquivos.createFile("materiais.json", "[]", MimeType.PLAIN_TEXT);
    return [];
  }
}

function salvarJsonMateriais(pastaArquivos, dados) {
  const files = pastaArquivos.getFilesByName("materiais.json");
  if (files.hasNext()) {
    files.next().setContent(JSON.stringify(dados));
  }
}

function salvarMaterialGS(ano, objMaterial) {
  try {
    const pastaAno = getOuCriarPastaAno(ano);
    const pastaArquivos = pastaAno.getFoldersByName("arquivos").next();
    
    let materiais = getJsonMateriais(pastaAno); 
    
    let novoArquivoId = null;
    let novaExtensao = "";
    
    if (objMaterial.arquivoBase64) {
      const blob = Utilities.newBlob(Utilities.base64Decode(objMaterial.arquivoBase64), objMaterial.mimeType, objMaterial.fileName);
      const file = pastaArquivos.createFile(blob);
      
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      novoArquivoId = file.getId();
      novaExtensao = objMaterial.fileName.split('.').pop();
    }

    const index = materiais.findIndex(m => m.id === objMaterial.id);
    let matData = {
      id: objMaterial.id || new Date().getTime().toString(),
      titulo: objMaterial.titulo, 
      tituloCompleto: objMaterial.tituloCompleto, 
      partido: objMaterial.partido,
      cargo: objMaterial.cargo,
      duracao: objMaterial.duracao,
      dataUpload: Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss")
    };

    if (index >= 0) {
      matData.arquivoId = novoArquivoId || materiais[index].arquivoId;
      matData.extensao = novaExtensao || materiais[index].extensao;
      matData.temArquivo = !!matData.arquivoId;
      materiais[index] = matData;
    } else {
      matData.arquivoId = novoArquivoId;
      matData.extensao = novaExtensao;
      matData.temArquivo = !!matData.arquivoId;
      materiais.push(matData);
    }
    
    // ATUALIZAÇÃO: Salva o JSON na pasta do Ano
    salvarJsonMateriais(pastaAno, materiais); 
    return { status: 'sucesso', materiais: materiais };
  } catch (e) {
    throw new Error("Erro ao salvar material: " + e.message);
  }
}

function listarMateriaisGS(ano) {
  try {
    const pastaAno = getOuCriarPastaAno(ano);
    return getJsonMateriais(pastaAno);
  } catch(e) {
    return [];
  }
}

// Função para resolver o bloqueio do Player (Converte arquivo do Drive em Base64 para o Front)
function obterBytesMidiaGS(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    return {
      base64: Utilities.base64Encode(blob.getBytes()),
      mimeType: file.getMimeType()
    };
  } catch(e) {
    throw new Error("Erro ao carregar mídia do Drive: " + e.message);
  }
}

// Função para Excluir Material e Mover para Lixeira
function excluirMaterialGS(ano, id) {
  try {
    const pastaAno = getOuCriarPastaAno(ano);
    let materiais = getJsonMateriais(pastaAno);
    
    const index = materiais.findIndex(m => m.id === id);
    if (index >= 0) {
      const mat = materiais[index];
      // Se tiver arquivo físico, move pra lixeira
      if (mat.arquivoId) {
         try { DriveApp.getFileById(mat.arquivoId).setTrashed(true); } catch(e) {}
      }
      // Remove do Banco de Dados JSON
      materiais.splice(index, 1);
      
      salvarJsonMateriais(pastaAno, materiais); 
    }
    return { status: 'sucesso', materiais: materiais };
  } catch (e) {
    throw new Error("Erro ao excluir material: " + e.message);
  }
}

// --------------------------------------------------------
// Função para extrair texto de PDF/Imagens via OCR
// --------------------------------------------------------
// --------------------------------------------------------
// Função para extrair texto de PDF/Imagens via OCR (Atualizada para Drive API v3)
// --------------------------------------------------------
function processarPDFComOCR(base64Data, fileName) {
  try {
    // Decodifica o base64 vindo do front-end
    let blob = Utilities.newBlob(Utilities.base64Decode(base64Data), MimeType.PDF, fileName);
    
    // 1. Em v3, usamos "name" no lugar de "title"
    let recurso = {
      name: "OCR_TEMP_" + fileName,
      mimeType: "application/vnd.google-apps.document" // Força a conversão para Google Doc (Aciona o OCR)
    };
    
    // 2. Em v3, o método é create() em vez de insert()
    let arquivoDoc = Drive.Files.create(recurso, blob);
    
    // 3. Abrir o Documento gerado e extrair texto bruto
    let docId = arquivoDoc.id;
    let doc = DocumentApp.openById(docId); 
    let textoExtraido = doc.getBody().getText(); 
    
    // 4. Apagar o arquivo temporário
    DriveApp.getFileById(docId).setTrashed(true);
    
    // Retorna o texto bruto para o front-end organizar 
    return textoExtraido;
    
  } catch (erro) {
    throw new Error("Erro no processamento OCR: " + erro.message);
  }
}

// Função para Salvar o Mapa em PDF
function salvarMapaGS(ano, nomePartido, htmlConteudo, numeroMapaOrig) {
  try {
    const pastaAno = getOuCriarPastaAno(ano);
    const pastaMapas = pastaAno.getFoldersByName("mapas").next();
    
    const numeroMapa = numeroMapaOrig || new Date().getTime().toString().slice(-6); 
    const nomeArquivo = `MAPA_${numeroMapa}_${nomePartido}.pdf`;
    
    const htmlLimpo = `
      <html>
        <head>
          <style>
          @page { size: A4 landscape; margin: 10mm; } 
            body { font-family: Arial, sans-serif; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #000; padding: 5px; text-align: left; }
            th { background-color: #ddd; }
          </style>
        </head>
        <body>
          ${htmlConteudo}
        </body>
      </html>
    `;
    const blob = Utilities.newBlob(htmlLimpo, MimeType.HTML).getAs(MimeType.PDF);
    blob.setName(nomeArquivo);
    pastaMapas.createFile(blob);
    
    return true;
  } catch(e) {
    throw new Error("Erro ao salvar PDF do Mapa: " + e.message);
  }
}
// ==========================================
// 4. MÓDULO DE ENVIOS (EMAILS E CONTATOS)
// ==========================================

function salvarContatosGS(ano, contatosString) {
  try {
    const pastaAno = getOuCriarPastaAno(ano);
    const files = pastaAno.getFilesByName("contatos.json");
    
    if (files.hasNext()) {
      files.next().setContent(contatosString);
    } else {
      pastaAno.createFile("contatos.json", contatosString, MimeType.PLAIN_TEXT);
    }
    return true;
  } catch(e) {
    throw new Error("Erro ao salvar contatos: " + e.message);
  }
}

function carregarContatosGS(ano) {
  try {
    const pastaAno = getOuCriarPastaAno(ano);
    const files = pastaAno.getFilesByName("contatos.json");
    
    if (files.hasNext()) {
      return files.next().getBlob().getDataAsString();
    }
    return "";
  } catch(e) {
    return "";
  }
}

function listarMapasGS(ano) {
  try {
    const pastaAno = getOuCriarPastaAno(ano);
    const pastaMapas = pastaAno.getFoldersByName("mapas").next();
    const files = pastaMapas.getFiles();
    let mapas = [];
    
    while(files.hasNext()){
      let f = files.next();
      mapas.push({
        id: f.getId(),
        nome: f.getName(),
        data: Utilities.formatDate(f.getDateCreated(), "GMT-3", "dd/MM/yyyy HH:mm")
      });
    }
    
    // Ordena do mais recente para o mais antigo
    mapas.sort((a, b) => b.nome.localeCompare(a.nome)); 
    return mapas;
  } catch(e) {
    return [];
  }
}

function enviarEmailGS(para, cc, assunto, corpo, idsAnexos) {
  try {
    let attachments = [];
    
    // Busca os arquivos no Drive para anexar fisicamente
    idsAnexos.forEach(id => {
      try {
        let file = DriveApp.getFileById(id);
        attachments.push(file.getBlob());
      } catch(err) {
        // Ignora arquivo se não encontrar
      }
    });

    MailApp.sendEmail({
      to: para,
      cc: cc,
      subject: assunto,
      body: corpo,
      attachments: attachments
    });
    
    return { status: "sucesso" };
  } catch (e) {
    throw new Error("Erro ao enviar email: " + e.message);
  }
}
