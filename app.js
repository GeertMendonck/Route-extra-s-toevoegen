(function(){
  'use strict';

  // ---------------- State ----------------
  var DATA = null;
  var currentView = 'prestart'; // 'prestart' | 'loc'
  var currentLocId = null;

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

  function imgUrlFromFileField(fileValue){
    // fileValue kan "menenpoort.jpg" zijn → toon als /assets/img/menenpoort.jpg
    // als user al "assets/img/..." invult, respecteer dat
    if(!fileValue) return '';
    if(/^https?:\/\//i.test(fileValue)) return fileValue;
    if(fileValue.indexOf('/') >= 0) return fileValue; // bv assets/img/x.jpg
    return 'assets/img/' + fileValue;
  }

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

      // preview: prefer cache (local chosen file), else guess by file path in repo
      var cacheKey = contextKey + '|' + idx;
      // placeholder node
        var ph = el('div','imgPlaceholder');
        ph.textContent = 'Preview: enkel nieuw toegevoegde foto’s worden getoond (tot je ze in /assets/img plaatst).';

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

        var cached = previewCache[cacheKey];
        var src = cached || imgUrlFromFileField(img.file || '');

        if(src){
        imgTag.src = src;
        hidePlaceholder();

        // als browser het niet kan laden -> placeholder tonen
        imgTag.onerror = function(){
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
          var s = imgUrlFromFileField(img.file || '');
          if(s) imgTag.src = s;
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
    var vragen = safeArr(vragenArr);

    vragen.forEach(function(txt, idx){
      var row = qs('tplVraagRow').content.firstElementChild.cloneNode(true);
      var ta = row.querySelector('.qText');
      ta.value = (txt==null?'':String(txt));

      function commit(){
        vragen[idx] = ta.value;
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

  var locVragenEl   = body.querySelector('#loc_vragen');
  var loc_addVraag  = body.querySelector('#loc_addVraag');

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
