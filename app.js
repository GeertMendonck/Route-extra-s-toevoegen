(function(){
  'use strict';

  // ---------------- State ----------------
  var DATA = null;
  var currentView = 'prestart'; // 'prestart' | 'loc'
  var currentLocId = null;
// onthoud laatste subtype per categorie (sessie)
var lastQType = {
  other: 'mc',
  media: 'photo'
};

  // preview cache: key = "prestart|loc:<id>" + index => dataUrl
  var previewCache = Object.create(null);

  // ---------------- Helpers ----------------
  function qs(id){ return document.getElementById(id); }
  function el(tag, cls){ var e=document.createElement(tag); if(cls) e.className=cls; return e; }

  function safeArr(a){ return Array.isArray(a) ? a : []; }
  function ensureObj(o){ return (o && typeof o === 'object') ? o : {}; }

  function deepGet(obj, path, fallback){
    try{
      var parts = path.split('.');
      var cur = obj;
      for(var i=0;i<parts.length;i++){
        if(cur == null) return fallback;
        cur = cur[parts[i]];
      }
      return (cur === undefined) ? fallback : cur;
    }catch(e){
      return fallback;
    }
  }

  function setEnabled(enabled){
    qs('btnDownload').disabled = !enabled;
    qs('btnCopy').disabled = !enabled;
    qs('metaTitle').disabled = !enabled;
    qs('metaSubtitle').disabled = !enabled;
    qs('metaVersion').disabled = !enabled;
    qs('searchLoc').disabled = !enabled;
    qs('metaHint').textContent = enabled ? 'Je wijzigingen worden live in het object gezet. Download wanneer klaar.' : 'Laad eerst een JSON-bestand.';
  }

  function prettyJson(){
    return JSON.stringify(DATA, null, 2);
  }
        function loadImagesIndex(cb){
        try{
            var base = DATA && DATA.meta && DATA.meta.assetsBase ? String(DATA.meta.assetsBase) : '';
            if(!base) return cb(new Error('assetsBase ontbreekt'));

            var url = base.replace(/\/+$/,'') + '/images/index.json?v=' + Date.now();

            fetch(url).then(function(r){
            if(!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
            }).then(function(obj){
            var files = (obj && obj.files && obj.files.length) ? obj.files.slice() : [];
            cb(null, files);
            }).catch(function(err){
            cb(err);
            });
        }catch(e){
            cb(e);
        }
        }
        var __imagesIndexCache = null;
        var __imagesIndexCacheAt = 0;
        var __imagesIndexCacheBase = '';

function loadImagesIndex(cb){
  try{
        var base = DATA && DATA.meta && DATA.meta.assetsBase ? String(DATA.meta.assetsBase).trim() : '';
        if(!base) return cb(new Error('assetsBase ontbreekt'));

        base = base.replace(/\/+$/,'') + '/';

        var now = Date.now();

        // ✅ cache alleen gebruiken als assetsBase dezelfde is
        if(__imagesIndexCache && __imagesIndexCacheBase === base && (now - __imagesIndexCacheAt) < 10000){
        return cb(null, __imagesIndexCache);
        }

        var url = base + 'images/index.json?v=' + now;

        fetch(url).then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
        }).then(function(obj){
        var files = (obj && obj.files && obj.files.length) ? obj.files.slice() : [];
        __imagesIndexCache = files;
        __imagesIndexCacheAt = now;
        __imagesIndexCacheBase = base; // ✅ onthoud bij welke base dit hoort
        cb(null, files);
        }).catch(function(err){
        cb(err);
        });
  }catch(e){
    cb(e);
  }
}
function bindImagePickerUI(selEl, txtEl, hintEl, previewEl, fileInputEl, arr, cachePrefix){
  if(!selEl && !txtEl && !fileInputEl) return;

  function setHint(msg){
    if(hintEl) hintEl.textContent = msg || '';
  }

  function setPreviewByName(name){
    if(!previewEl) return;
    name = String(name||'').trim();
    if(!name){
      previewEl.style.display = 'none';
      previewEl.src = '';
      return;
    }
    previewEl.style.display = 'block';
    previewEl.src = resolveImageFile(name, DATA);
    previewEl.onerror = function(){
      previewEl.onerror = null;
      previewEl.style.display = 'none';
      setHint('⚠️ Bestand niet gevonden op GitHub. Upload "' + name + '" naar images/ en commit & push.');
    };
  }

  function applyName(name, origin){
    name = String(name||'').trim();
    if(!name) return;

    // voeg toe als nieuwe rij (zodat je het in je list editor ziet)
    arr.push({ file: name, credit:'' });

    // previewCache: toon lokaal preview enkel voor dropped files (origin === 'drop')
    if(origin === 'drop'){
      setHint('📌 Lokaal gekozen. Upload "' + name + '" nog naar images/ in je GitHub afbeeldingen-repo.');
      // preview via cache gebeurt in addImagesFromFiles; hier tonen we alvast remote preview-poging
    } else {
      setHint('');
    }

    // 1 rerender zodat buildImagesEditor de nieuwe rij toont
    renderEditor();
  }

  // combobox vullen
  if(selEl){
    selEl.disabled = true;
    selEl.innerHTML = '<option value="">Kies uit lijst…</option>';

    var base = DATA && DATA.meta && DATA.meta.assetsBase ? String(DATA.meta.assetsBase).trim() : '';
    if(!base){
      setHint('ℹ️ Vul eerst meta.assetsBase in. Zonder dat kunnen we images/index.json niet laden.');
    } else {
      loadImagesIndex(function(err, files){
        if(err){
          selEl.disabled = true;
          setHint('ℹ️ Geen images/index.json gevonden. Typ een bestandsnaam of sleep een foto (en upload daarna naar GitHub).');
          return;
        }
        selEl.disabled = false;
        for(var i=0;i<files.length;i++){
          var opt = document.createElement('option');
          opt.value = files[i];
          opt.textContent = files[i];
          selEl.appendChild(opt);
        }
      });
    }

    selEl.addEventListener('change', function(){
      if(this.value){
        applyName(this.value, 'select');
        this.value = ''; // reset zodat je opnieuw kan kiezen
      }
    });
  }

  // typen
  if(txtEl){
    txtEl.addEventListener('change', function(){
      var v = String(this.value||'').trim();
      if(v){
        applyName(v, 'typed');
        this.value = '';
      }
    });

    // optioneel: live preview terwijl je typt
    txtEl.addEventListener('input', function(){
      setPreviewByName(this.value);
    });
  }

  // file picker (neemt naam, maar jouw bestaande addImagesFromFiles regelt previewCache)
  if(fileInputEl){
    fileInputEl.addEventListener('change', function(){
      // jouw bestaande handler blijft ook bestaan; dus hier NIET dubbel afhandelen
      // wél: live hint/preview als iemand enkel via picker iets kiest maar je handler faalt
      var f = fileInputEl.files && fileInputEl.files[0];
      if(f && f.name){
        setHint('📌 Lokaal gekozen. Upload "' + f.name + '" nog naar images/ in je GitHub afbeeldingen-repo.');
      }
    });
  }

  // init preview leeg
  setPreviewByName('');
}

    function ensureLastImageObj(arr){
  arr = safeArr(arr);
  if(!arr.length) arr.push({ file:'', credit:'' });
  return arr[arr.length - 1];
}
  
function bindImagePicker(rootEl, getFile, setFile){
  var sel  = rootEl.querySelector('.imgPickSelect');
  var txt  = rootEl.querySelector('.imgPickText');
  var drop = rootEl.querySelector('.imgDrop');
  var fin  = rootEl.querySelector('.fileInput');
  var hint = rootEl.querySelector('.imgHint');
  var prev = rootEl.querySelector('.imgPreview');

  function setHint(msg){
    if(hint) hint.textContent = msg || '';
  }

  function updatePreview(){
    var f = getFile();
    if(!prev) return;

    if(!f){
      prev.style.display = 'none';
      prev.src = '';
      return;
    }

    // preview via jouw resolver (optie 2)
    var url = resolveImageFile(f, DATA);

    prev.style.display = 'block';
    prev.src = url;
    prev.onerror = function(){
      prev.onerror = null;
      prev.style.display = 'none';
      setHint('⚠️ Bestand niet gevonden op GitHub. Upload "' + f + '" naar images/ en commit & push.');
    };
  }

  function applyFile(name, origin){
    name = String(name || '').trim();
    setFile(name);
    if(txt) txt.value = name;

    if(origin === 'dropped' && name){
      setHint('📌 Je sleepte een foto. Upload "' + name + '" nog naar images/ en commit & push.');
    } else {
      setHint('');
    }

    updatePreview();
    // indien je validation/render wil triggeren:
    // renderValidation();
  }

  // combobox vullen (als mogelijk)
  if(sel){
    sel.innerHTML = '<option value="">Kies uit lijst…</option>';
    sel.disabled = true;

    loadImagesIndex(function(err, files){
      if(err){
        sel.disabled = true;
        setHint('ℹ️ Geen images/index.json gevonden. Typ een bestandsnaam of sleep een foto (en upload later naar GitHub).');
        return;
      }
      sel.disabled = false;
      for(var i=0;i<files.length;i++){
        var opt = document.createElement('option');
        opt.value = files[i];
        opt.textContent = files[i];
        sel.appendChild(opt);
      }
      // selecteer huidige waarde
      var cur = getFile();
      if(cur) sel.value = cur;
    });

    sel.addEventListener('change', function(){
      if(this.value) applyFile(this.value, 'select');
    });
  }

  // typen
  if(txt){
    txt.value = getFile() || '';
    txt.addEventListener('input', function(){
      applyFile(this.value, 'typed');
    });
  }

  // drag & drop + file picker (we nemen enkel de naam over)
  function openFilePicker(){
    if(fin) fin.click();
  }

  if(drop){
    drop.addEventListener('click', openFilePicker);

    drop.addEventListener('dragover', function(e){
      e.preventDefault();
      drop.classList.add('drag');
    });
    drop.addEventListener('dragleave', function(){
      drop.classList.remove('drag');
    });
    drop.addEventListener('drop', function(e){
      e.preventDefault();
      drop.classList.remove('drag');

      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if(!file) return;

      applyFile(file.name, 'dropped');
    });
  }

  if(fin){
    fin.addEventListener('change', function(){
      var file = fin.files && fin.files[0];
      if(file) applyFile(file.name, 'dropped');
      fin.value = '';
    });
  }

  updatePreview();
}



  function download(filename, text){
    var blob = new Blob([text], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = filename || 'route.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 800);
  }

  function toast(msg){
    // super mini toast
    var t = el('div');
    t.textContent = msg;
    t.style.position='fixed';
    t.style.left='50%';
    t.style.top='16px';
    t.style.transform='translateX(-50%)';
    t.style.padding='10px 14px';
    t.style.border='1px solid rgba(255,255,255,.12)';
    t.style.borderRadius='14px';
    t.style.background='rgba(0,0,0,.55)';
    t.style.backdropFilter='blur(8px)';
    t.style.zIndex='9999';
    document.body.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity .25s'; }, 1400);
    setTimeout(function(){ t.remove(); }, 1800);
  }

//  function imgUrlFromFileField(file){
//   file = String(file || '').trim();
//   if(!file) return '';

//   // absolute url toelaten
//   if(/^https?:\/\//i.test(file)) return file;

//   // assetsBase verplicht in jouw nieuwe model
//   var base = (DATA && DATA.meta && DATA.meta.assetsBase) ? String(DATA.meta.assetsBase).trim() : '';
//   if(!base) return '';

//   base = base.replace(/\/+$/,'') + '/';
//   file = file.replace(/^\/+/,'');
//   return base + 'images/' + file;
// }


  function makeMapLink(lat,lng){
    if(lat==null || lng==null) return '#';
    return 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng);
  }
    function bindDropzone(zoneEl, onFiles){
    if(!zoneEl) return;

    zoneEl.addEventListener('dragover', function(e){
        e.preventDefault();
        zoneEl.classList.add('dragover');
    });
    zoneEl.addEventListener('dragleave', function(){
        zoneEl.classList.remove('dragover');
    });
    zoneEl.addEventListener('drop', function(e){
        e.preventDefault();
        zoneEl.classList.remove('dragover');

        var files = e.dataTransfer && e.dataTransfer.files;
        if(files && files.length){
        onFiles(files);
        }
    });
}

  // ---------------- Navigation ----------------
  function renderLocList(filterText){
    var list = qs('locList');
    list.innerHTML = '';
    if(!DATA) return;

    var locs = safeArr(DATA.locaties);
    var q = (filterText||'').trim().toLowerCase();

    locs.forEach(function(loc){
      var name = (loc.naam || loc.id || '').toString();
      if(q && name.toLowerCase().indexOf(q) === -1 && (loc.id||'').toLowerCase().indexOf(q) === -1) return;

      var b = el('button','navItem');
      b.textContent = '📍 ' + (loc.naam || loc.id);
      b.dataset.locId = loc.id;
      if(currentView==='loc' && currentLocId===loc.id) b.classList.add('active');
      b.addEventListener('click', function(){
        currentView = 'loc';
        currentLocId = loc.id;
        setActiveTab('locaties');
        renderEditor();
        renderLocList(qs('searchLoc').value);
      });
      list.appendChild(b);
    });
  }

  function setActiveTab(tab){
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(t){
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    qs('navPrestart').classList.toggle('hidden', tab !== 'prestart');
    qs('navLocaties').classList.toggle('hidden', tab !== 'locaties');

    // highlight prestart button
    qs('navPrestartBtn').classList.toggle('active', tab==='prestart' && currentView==='prestart');
  }

  // ---------------- Image editor widgets ----------------
  function buildImagesEditor(container, imagesArray, contextKey, onChange){
    container.innerHTML = '';
    var images = safeArr(imagesArray);

    images.forEach(function(img, idx){
      img = ensureObj(img);
      var rowTpl = qs('tplImageRow');
      var row = rowTpl.content.firstElementChild.cloneNode(true);

      var imgTag = row.querySelector('.imgTag');
      var previewBox = row.querySelector('.imgPreview');
      var inpFile = row.querySelector('.imgFile');
      var inpCredit = row.querySelector('.imgCredit');
      var inpCaption = row.querySelector('.imgCaption');

      inpFile.value = img.file || '';
      inpCredit.value = img.credit || '';
      inpCaption.value = img.caption || '';

 // preview: prefer cache (local chosen file), else remote via assetsBase/images/
var cacheKey = contextKey + '|' + idx;

// placeholder node
var ph = el('div','imgPlaceholder');
ph.textContent = 'Preview: enkel nieuw toegevoegde foto’s worden getoond. Upload het bestand daarna naar de repo-map images/ (GitHub Pages).';

function showPlaceholder(){
  imgTag.removeAttribute('src');
  if(!previewBox.querySelector('.imgPlaceholder')){
    previewBox.appendChild(ph);
  }
}
function hidePlaceholder(){
  var p = previewBox.querySelector('.imgPlaceholder');
  if(p) p.remove();
}

function remoteSrc(){
  var f = (img && img.file) ? String(img.file).trim() : '';
  if(!f) return '';
  // ✅ jouw nieuwe model: assetsBase + images/ + file
  return resolveImageFile(f, DATA);
}

var cached = previewCache[cacheKey];
var src = cached || remoteSrc();

if(src){
  imgTag.src = src;
  hidePlaceholder();

  imgTag.onerror = function(){
    // remote faalt of cached is ongeldig
    showPlaceholder();
  };
}else{
  showPlaceholder();
}

      function commit(){
        img.file = inpFile.value.trim();
        img.credit = inpCredit.value.trim();
        var cap = inpCaption.value.trim();
        if(cap) img.caption = cap; else delete img.caption;
        images[idx] = img;
        onChange(images);
        // update preview from file field if no cached preview
        if(!previewCache[cacheKey]){
        var s = remoteSrc();
        if(s){
            imgTag.src = s;
            hidePlaceholder();
            imgTag.onerror = function(){ showPlaceholder(); };
        }else{
            showPlaceholder();
        }
        }

      }

      inpFile.addEventListener('input', commit);
      inpCredit.addEventListener('input', commit);
      inpCaption.addEventListener('input', commit);

      row.querySelector('.imgUp').addEventListener('click', function(){
        if(idx<=0) return;
        var tmp = images[idx-1]; images[idx-1]=images[idx]; images[idx]=tmp;
        onChange(images);
        renderEditor(); // simplest: rerender
      });
      row.querySelector('.imgDown').addEventListener('click', function(){
        if(idx>=images.length-1) return;
        var tmp = images[idx+1]; images[idx+1]=images[idx]; images[idx]=tmp;
        onChange(images);
        renderEditor();
      });
      row.querySelector('.imgDel').addEventListener('click', function(){
        images.splice(idx,1);
        // cleanup cache shifting is overkill; just delete this key
        delete previewCache[cacheKey];
        onChange(images);
        renderEditor();
      });

      container.appendChild(row);
    });
  }
  function resolveImageFile(file, data){
  file = String(file || '').trim();
  if(!file) return '';

  // absolute URL’s laten passeren
  if(/^https?:\/\//i.test(file)) return file;

  // assetsBase is de route-root
  var base = (data && data.meta && data.meta.assetsBase) ? String(data.meta.assetsBase).trim() : '';
  if(!base) return '';

  // trailing slash normaliseren
  base = base.replace(/\/+$/,'') + '/';

  // geen leading slash in file
  file = file.replace(/^\/+/,'');
  // veiligheid: als iemand toch 'images/...' invult, haal het weg om dubbel te vermijden
  file = file.replace(/^images\//i, '');

  return base + 'images/' + file;
}


  function handleAddImageFile(fileInput, imagesArray, contextKey, onChange){
    var f = fileInput.files && fileInput.files[0];
    if(!f) return;
    var name = f.name || 'image.jpg';

    var idx = imagesArray.length;
    imagesArray.push({ file: name, credit: '' });
    onChange(imagesArray);

    // preview local file (does not upload anywhere)
    var reader = new FileReader();
    reader.onload = function(){
      previewCache[contextKey + '|' + idx] = reader.result;
      renderEditor();
    };
    reader.readAsDataURL(f);

    // reset input so selecting same file again still triggers change
    fileInput.value = '';
  }

  // ---------------- Questions editor ----------------
 function buildVragenEditor(container, vragenArr, onChange){
  container.innerHTML = '';
  var vragenRaw = safeArr(vragenArr);

  // normaliseer: string -> object
  var vragen = vragenRaw.map(function(v, i){
    if(v && typeof v === 'object'){
      // minimale defaults
      if(!v.type) v.type = 'open';
      if(v.vraag == null && v.text != null) v.vraag = v.text; // kleine legacy-hulp
      if(v.vraag == null) v.vraag = '';
      if(!v.id) v.id = genVraagId();
      return v;
    }
    // string/anders -> open vraag
    return { id: genVraagId(), type:'open', vraag:(v==null?'':String(v)) };
  });

  vragen.forEach(function(q, idx){
    var row = qs('tplVraagRow').content.firstElementChild.cloneNode(true);
    var ta = row.querySelector('.qText');
    ta.value = (q.vraag==null?'':String(q.vraag));

    function commit(){
      vragen[idx].vraag = ta.value;
      onChange(vragen);
    }
    ta.addEventListener('input', commit);

    row.querySelector('.qUp').addEventListener('click', function(){
      if(idx<=0) return;
      var tmp = vragen[idx-1]; vragen[idx-1]=vragen[idx]; vragen[idx]=tmp;
      onChange(vragen);
      renderEditor();
    });
    row.querySelector('.qDown').addEventListener('click', function(){
      if(idx>=vragen.length-1) return;
      var tmp = vragen[idx+1]; vragen[idx+1]=vragen[idx]; vragen[idx]=tmp;
      onChange(vragen);
      renderEditor();
    });
    row.querySelector('.qDel').addEventListener('click', function(){
      vragen.splice(idx,1);
      onChange(vragen);
      renderEditor();
    });

    container.appendChild(row);
  });
}

// simpele id generator (bovenaan in je script zetten)
function genVraagId(){
  return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
}

function normalizeVragen(arr){
  var raw = safeArr(arr);
  return raw.map(function(v){
    var q;
    if(v && typeof v === 'object'){
      q = v;
      if(!q.id) q.id = genVraagId();
      if(!q.type) q.type = 'open';
      if(q.vraag == null) q.vraag = '';
    } else {
      q = { id: genVraagId(), type:'open', vraag:(v==null?'':String(v)) };
    }

    // defaults per type
    if(q.type === 'mc' || q.type === 'checkbox'){
      q.opties = safeArr(q.opties);
      if(q.opties.length === 0) q.opties = [''];
    }

    return q;
  });
}


function buildVragenEditor(container, vragenArr, onChange){
  container.innerHTML = '';

  var vragen = normalizeVragen(vragenArr);

  function commitAll(){
    onChange(vragen);
  }

  vragen.forEach(function(q, idx){
    var row = qs('tplVraagRow').content.firstElementChild.cloneNode(true);

    var ta = row.querySelector('.qText');
    var badge = row.querySelector('.qTypeBadge');
    var optBox = row.querySelector('.qOptions');
    var optList = row.querySelector('.qOptList');
    var btnAddOpt = row.querySelector('.qAddOpt');

    // badge
    badge.textContent = String(q.type || 'open').toUpperCase();

    // vraagtekst
    ta.value = (q.vraag==null?'':String(q.vraag));
    ta.addEventListener('input', function(){
      vragen[idx].vraag = ta.value;
      commitAll();
    });

    // opties enkel voor mc/checkbox
    var hasOptions = (q.type === 'mc' || q.type === 'checkbox');
    if(hasOptions){
      optBox.classList.remove('hidden');
      optList.innerHTML = '';

      // render opties
      (q.opties || []).forEach(function(opt, j){
        var r = document.createElement('div');
        r.className = 'qOptRow';

        var inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'input';
        inp.placeholder = 'Optie…';
        inp.value = (opt==null?'':String(opt));
        inp.addEventListener('input', function(){
          vragen[idx].opties[j] = inp.value;
          commitAll();
        });

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn danger small';
        del.textContent = '✕';
        del.title = 'Verwijder optie';
        del.addEventListener('click', function(){
          vragen[idx].opties.splice(j, 1);
          if(vragen[idx].opties.length === 0) vragen[idx].opties.push('');
          commitAll();
          renderEditor();
        });

        r.appendChild(inp);
        r.appendChild(del);
        optList.appendChild(r);
      });

      if(btnAddOpt){
        btnAddOpt.addEventListener('click', function(){
          vragen[idx].opties = safeArr(vragen[idx].opties);
          vragen[idx].opties.push('');
          commitAll();
          renderEditor();
        });
      }
    } else {
      optBox.classList.add('hidden');
    }

    // reorder/delete (zoals jij had)
    row.querySelector('.qUp').addEventListener('click', function(){
      if(idx<=0) return;
      var tmp = vragen[idx-1]; vragen[idx-1]=vragen[idx]; vragen[idx]=tmp;
      commitAll();
      renderEditor();
    });

    row.querySelector('.qDown').addEventListener('click', function(){
      if(idx>=vragen.length-1) return;
      var tmp = vragen[idx+1]; vragen[idx+1]=vragen[idx]; vragen[idx]=tmp;
      commitAll();
      renderEditor();
    });

    row.querySelector('.qDel').addEventListener('click', function(){
      vragen.splice(idx,1);
      commitAll();
      renderEditor();
    });

    container.appendChild(row);
  });
}



  // ---------------- Editor render ----------------
function renderEditor(){
  var body = qs('editorBody');
  if(!body) return;

  body.innerHTML = '';

  if(!DATA){
    body.appendChild(el('div','hint')).textContent = 'Laad een JSON om te starten.';
    return;
  }

  // helper: voeg meerdere files toe + previews, met één nette rerender
  function addImagesFromFiles(files, arr, cachePrefix){
    if(!files || !files.length) return;

    var startIndex = arr.length;
    // eerst data toevoegen
    for(var i=0;i<files.length;i++){
      var f = files[i];
      arr.push({ file: (f && f.name) ? f.name : 'image.jpg', credit: '' });
    }

    // dan previews inlezen
    var remaining = files.length;
    for(var j=0;j<files.length;j++){
      (function(file, idx){
        var reader = new FileReader();
        reader.onload = function(){
          previewCache[cachePrefix + '|' + idx] = reader.result;
          remaining--;
          if(remaining <= 0){
            renderEditor(); // 1 rerender wanneer alles klaar is
          }
        };
        reader.onerror = function(){
          remaining--;
          if(remaining <= 0) renderEditor();
        };
        reader.readAsDataURL(file);
      })(files[j], startIndex + j);
    }

    // snelle render zodat je de nieuwe rijen al ziet, preview volgt daarna
    renderEditor();
  }

  // ---------------- PRESTART ----------------
  if(currentView === 'prestart'){
    qs('editorTitle').textContent = 'Prestart';

    var node = qs('tplPrestart').content.cloneNode(true);
    body.appendChild(node);

    // pak elementen binnen de editor (niet globaal)
    var pre_useLocationId = body.querySelector('#pre_useLocationId');
    var pre_meetingLabel  = body.querySelector('#pre_meetingLabel');
    var pre_meetingLat    = body.querySelector('#pre_meetingLat');
    var pre_meetingLng    = body.querySelector('#pre_meetingLng');
    var pre_message       = body.querySelector('#pre_message');

    var preImagesEl       = body.querySelector('#pre_images');
    var pre_addImageFile  = body.querySelector('#pre_addImageFile');
    var pre_dropzone      = body.querySelector('#pre_dropzone');

    // ensure paths
    DATA.prestart = ensureObj(DATA.prestart);
    DATA.prestart.meetingPoint = ensureObj(DATA.prestart.meetingPoint);
    DATA.prestart.images = safeArr(DATA.prestart.images);

    // set values
    pre_useLocationId.value = DATA.prestart.useLocationId || '';
    pre_meetingLabel.value  = DATA.prestart.meetingPoint.label || '';
    pre_meetingLat.value    = (DATA.prestart.meetingPoint.lat!=null) ? DATA.prestart.meetingPoint.lat : '';
    pre_meetingLng.value    = (DATA.prestart.meetingPoint.lng!=null) ? DATA.prestart.meetingPoint.lng : '';
    pre_message.value       = DATA.prestart.message || '';

    // listeners
    pre_useLocationId.addEventListener('input', function(){ DATA.prestart.useLocationId = this.value.trim(); });
    pre_meetingLabel.addEventListener('input', function(){ DATA.prestart.meetingPoint.label = this.value; });
    pre_meetingLat.addEventListener('input', function(){ DATA.prestart.meetingPoint.lat = this.value===''?null:Number(this.value); });
    pre_meetingLng.addEventListener('input', function(){ DATA.prestart.meetingPoint.lng = this.value===''?null:Number(this.value); });
    pre_message.addEventListener('input', function(){ DATA.prestart.message = this.value; });

    // images editor
    buildImagesEditor(preImagesEl, DATA.prestart.images, 'prestart', function(newArr){
      DATA.prestart.images = newArr;
    });

    // file picker
    if(pre_addImageFile){
      pre_addImageFile.addEventListener('change', function(){
        handleAddImageFile(pre_addImageFile, DATA.prestart.images, 'prestart', function(newArr){
          DATA.prestart.images = newArr;
        });
      });
    }
// ✅ combobox + naam-input + preview
var pre_imgSelect  = body.querySelector('#pre_imgSelect');
var pre_imgName    = body.querySelector('#pre_imgName');
var pre_imgHint    = body.querySelector('#pre_imgHint');
var pre_imgPreview = body.querySelector('#pre_imgPreview');

bindImagePickerUI(
  pre_imgSelect,
  pre_imgName,
  pre_imgHint,
  pre_imgPreview,
  pre_addImageFile,
  DATA.prestart.images,
  'prestart'
);

    // drag & drop
    if(pre_dropzone){
      bindDropzone(pre_dropzone, function(files){
        addImagesFromFiles(files, DATA.prestart.images, 'prestart');
      });
    }

    return;
  }

  // ---------------- LOCATIE ----------------
  var locs = safeArr(DATA.locaties);
  var loc = null;
  for(var i=0;i<locs.length;i++){
    if(locs[i] && locs[i].id === currentLocId){ loc = locs[i]; break; }
  }
  if(!loc){
    body.appendChild(el('div','hint')).textContent = 'Kies een locatie links.';
    return;
  }

  qs('editorTitle').textContent = 'Locatie';

  var n2 = qs('tplLocatie').content.cloneNode(true);
  body.appendChild(n2);

  // elementen binnen body
  var loc_id        = body.querySelector('#loc_id');
  var loc_slot      = body.querySelector('#loc_slot');
  var loc_naam      = body.querySelector('#loc_naam');
  var loc_lat       = body.querySelector('#loc_lat');
  var loc_lng       = body.querySelector('#loc_lng');
  var loc_radius    = body.querySelector('#loc_radius');
  var loc_routeHint = body.querySelector('#loc_routeHint');
  var loc_uitlegKort= body.querySelector('#loc_uitlegKort');
  var loc_uitlegLang= body.querySelector('#loc_uitlegLang');
  var loc_mapLink   = body.querySelector('#loc_mapLink');

  var locImagesEl   = body.querySelector('#loc_images');
  var loc_addImageFile = body.querySelector('#loc_addImageFile');
  var loc_dropzone  = body.querySelector('#loc_dropzone');

  //var locVragenEl   = body.querySelector('#loc_vragen');
  //var loc_addVraag  = body.querySelector('#loc_addVraag');
var locVragenEl   = body.querySelector('#loc_vragen');

// nieuwe knoppen
var q_addOpen      = body.querySelector('#q_addOpen');
var q_addOther     = body.querySelector('#q_addOther');
var q_otherMenuBtn = body.querySelector('#q_otherMenuBtn');
var q_otherMenu    = body.querySelector('#q_otherMenu');

var q_addMedia     = body.querySelector('#q_addMedia');
var q_mediaMenuBtn = body.querySelector('#q_mediaMenuBtn');
var q_mediaMenu    = body.querySelector('#q_mediaMenu');

// ensure + normaliseer zodat loc.vragen intern objecten worden
loc.vragen = normalizeVragen(loc.vragen);

// render vragen
buildVragenEditor(locVragenEl, loc.vragen, function(newArr){
  loc.vragen = newArr;
});

function addVraagOfType(t){
  loc.vragen = normalizeVragen(loc.vragen); // safety
  loc.vragen.push({ id: genVraagId(), type: t, vraag: '' });
  renderEditor();
}

function setButtonLabels(){
  if(q_addOther) q_addOther.textContent = '+ ANDER: ' + String(lastQType.other).toUpperCase();
  if(q_addMedia) q_addMedia.textContent = '+ MEDIA: ' + String(lastQType.media).toUpperCase();
}

// init labels
setButtonLabels();
// start altijd dicht
closeMenu(q_otherMenu);
closeMenu(q_mediaMenu);

// klik in menu mag niet bubbelen naar document
if(q_otherMenu){
  q_otherMenu.addEventListener('click', function(e){ e.stopPropagation(); });
}
if(q_mediaMenu){
  q_mediaMenu.addEventListener('click', function(e){ e.stopPropagation(); });
}

// direct add buttons
if(q_addOpen){
  q_addOpen.addEventListener('click', function(){
    addVraagOfType('open');
  });
}
if(q_addOther){
  q_addOther.addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    addVraagOfType(lastQType.other || 'mc');
  });
}
if(q_addMedia){
  q_addMedia.addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    addVraagOfType(lastQType.media || 'photo');
  });
}


// dropdown helpers
function openMenu(menuEl){
  if(!menuEl) return;
  menuEl.classList.remove('hidden');
}
function closeMenu(menuEl){
  if(!menuEl) return;
  menuEl.classList.add('hidden');
}
function toggleMenu(menuEl){
  if(!menuEl) return;
  if(menuEl.classList.contains('hidden')) openMenu(menuEl);
  else closeMenu(menuEl);
}

// menu button clicks
if(q_otherMenuBtn){
  q_otherMenuBtn.addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    toggleMenu(q_otherMenu);
    closeMenu(q_mediaMenu);
  });
}
if(q_mediaMenuBtn){
  q_mediaMenuBtn.addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    toggleMenu(q_mediaMenu);
    closeMenu(q_otherMenu);
  });
}

// menu item clicks (event delegation)
if(q_otherMenu){
  q_otherMenu.addEventListener('click', function(e){
    var btn = e.target && e.target.closest ? e.target.closest('.ddItem') : null;
    if(!btn) return;
    var t = btn.getAttribute('data-qtype') || 'mc';
    lastQType.other = t;
    setButtonLabels();
    closeMenu(q_otherMenu);
    addVraagOfType(t);
  });
}
if(q_mediaMenu){
  q_mediaMenu.addEventListener('click', function(e){
    var btn = e.target && e.target.closest ? e.target.closest('.ddItem') : null;
    if(!btn) return;
    var t = btn.getAttribute('data-qtype') || 'photo';
    lastQType.media = t;
    setButtonLabels();
    closeMenu(q_mediaMenu);
    addVraagOfType(t);
  });
}

// click outside closes menus
document.addEventListener('click', function(){
  closeMenu(q_otherMenu);
  closeMenu(q_mediaMenu);
});

  // ensure
  loc.uitleg = ensureObj(loc.uitleg);
  loc.images = safeArr(loc.images);
  loc.vragen = safeArr(loc.vragen);

  // set values
  loc_id.value         = loc.id || '';
  loc_slot.value       = loc.slot || '';
  loc_naam.value       = loc.naam || '';
  loc_lat.value        = (loc.lat!=null) ? loc.lat : '';
  loc_lng.value        = (loc.lng!=null) ? loc.lng : '';
  loc_radius.value     = (loc.radius!=null) ? loc.radius : '';
  loc_routeHint.value  = loc.routeHint || '';
  loc_uitlegKort.value = loc.uitleg.kort || '';
  loc_uitlegLang.value = loc.uitleg.uitgebreid || '';

  if(loc_mapLink){
    loc_mapLink.href = makeMapLink(loc.lat, loc.lng);
  }

  // listeners
  loc_slot.addEventListener('input', function(){ loc.slot = this.value.trim(); });
  loc_naam.addEventListener('input', function(){ loc.naam = this.value; });

  loc_lat.addEventListener('input', function(){
    loc.lat = this.value===''?null:Number(this.value);
    if(loc_mapLink) loc_mapLink.href = makeMapLink(loc.lat, loc.lng);
  });
  loc_lng.addEventListener('input', function(){
    loc.lng = this.value===''?null:Number(this.value);
    if(loc_mapLink) loc_mapLink.href = makeMapLink(loc.lat, loc.lng);
  });
  loc_radius.addEventListener('input', function(){ loc.radius = this.value===''?null:Number(this.value); });
  loc_routeHint.addEventListener('input', function(){ loc.routeHint = this.value; });
  loc_uitlegKort.addEventListener('input', function(){ loc.uitleg.kort = this.value; });
  loc_uitlegLang.addEventListener('input', function(){ loc.uitleg.uitgebreid = this.value; });

  // images
  buildImagesEditor(locImagesEl, loc.images, 'loc:' + loc.id, function(newArr){
    loc.images = newArr;
  });

  if(loc_addImageFile){
    loc_addImageFile.addEventListener('change', function(){
      handleAddImageFile(loc_addImageFile, loc.images, 'loc:' + loc.id, function(newArr){
        loc.images = newArr;
      });
    });
  }

  if(loc_dropzone){
    bindDropzone(loc_dropzone, function(files){
      addImagesFromFiles(files, loc.images, 'loc:' + loc.id);
    });
  }
// ✅ combobox + naam-input + preview
var loc_imgSelect  = body.querySelector('#loc_imgSelect');
var loc_imgName    = body.querySelector('#loc_imgName');
var loc_imgHint    = body.querySelector('#loc_imgHint');
var loc_imgPreview = body.querySelector('#loc_imgPreview');

bindImagePickerUI(
  loc_imgSelect,
  loc_imgName,
  loc_imgHint,
  loc_imgPreview,
  loc_addImageFile,
  loc.images,
  'loc:' + loc.id
);

  // vragen
  buildVragenEditor(locVragenEl, loc.vragen, function(newArr){
    loc.vragen = newArr;
  });

  if(loc_addVraag){
    loc_addVraag.addEventListener('click', function(){
      loc.vragen.push('');
      renderEditor();
    });
  }
}


  // ---------------- Load / Bind top UI ----------------
  function bindTabs(){
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(t){
      t.addEventListener('click', function(){
        var tab = t.dataset.tab;
        setActiveTab(tab);
        if(tab === 'prestart'){
          currentView = 'prestart';
          renderEditor();
          renderLocList(qs('searchLoc').value);
        }else{
          // locaties tab
          if(currentView !== 'loc'){
            currentView = 'loc';
            // default: first location if none selected
            if(!currentLocId && DATA && Array.isArray(DATA.locaties) && DATA.locaties[0]) currentLocId = DATA.locaties[0].id;
          }
          renderEditor();
          renderLocList(qs('searchLoc').value);
        }
      });
    });

    qs('navPrestartBtn').addEventListener('click', function(){
      currentView='prestart';
      setActiveTab('prestart');
      renderEditor();
      renderLocList(qs('searchLoc').value);
    });
  }

  function bindMeta(){
    qs('metaTitle').addEventListener('input', function(){ if(DATA && DATA.meta) DATA.meta.title = this.value; });
    qs('metaSubtitle').addEventListener('input', function(){ if(DATA && DATA.meta) DATA.meta.subtitle = this.value; });
    qs('metaVersion').addEventListener('input', function(){ if(DATA && DATA.meta) DATA.meta.version = this.value; });
  }

  function loadJsonText(text){
    var obj = null;
    try{
      obj = JSON.parse(text);
    }catch(e){
      alert('JSON parse error: ' + (e && e.message ? e.message : e));
      return;
    }

    // minimal normalisatie
    obj.meta = ensureObj(obj.meta);
    obj.settings = ensureObj(obj.settings);
    obj.prestart = ensureObj(obj.prestart);
    obj.prestart.meetingPoint = ensureObj(obj.prestart.meetingPoint);
    obj.prestart.images = safeArr(obj.prestart.images);
    obj.locaties = safeArr(obj.locaties);

    DATA = obj;

    // init view
    currentView = 'prestart';
    currentLocId = (obj.locaties[0] && obj.locaties[0].id) ? obj.locaties[0].id : null;

    // fill meta
    qs('metaTitle').value = DATA.meta.title || '';
    qs('metaSubtitle').value = DATA.meta.subtitle || '';
    qs('metaVersion').value = DATA.meta.version || '';

    setEnabled(true);
    setActiveTab('prestart');
    renderLocList('');
    renderEditor();
  }

  function bindFileLoad(){
    qs('fileJson').addEventListener('change', function(){
      var f = this.files && this.files[0];
      if(!f) return;
      var reader = new FileReader();
      reader.onload = function(){
        // clear previews when loading a new json
        previewCache = Object.create(null);
        loadJsonText(reader.result);
      };
      reader.readAsText(f);
      this.value='';
    });
  }

  function bindDownload(){
    qs('btnDownload').addEventListener('click', function(){
      if(!DATA) return;
      var name = (DATA.meta && DATA.meta.title) ? DATA.meta.title.replace(/[^\w\-]+/g,'_') : 'route';
      download(name + '.json', prettyJson());
    });

    qs('btnCopy').addEventListener('click', function(){
      if(!DATA) return;
      var txt = prettyJson();
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(function(){
          toast('JSON gekopieerd 📋');
        }).catch(function(){
          toast('Kopiëren lukte niet (browser).');
        });
      }else{
        // fallback
        var ta = el('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        try{ document.execCommand('copy'); toast('JSON gekopieerd 📋'); }catch(e){ toast('Kopiëren lukte niet.'); }
        ta.remove();
      }
    });
  }

  function bindSearch(){
    qs('searchLoc').addEventListener('input', function(){
      renderLocList(this.value);
    });
  }

  // ---------------- Init ----------------
  function init(){
    setEnabled(false);
    bindTabs();
    bindMeta();
    bindFileLoad();
    bindDownload();
    bindSearch();
  }

  init();

})();
