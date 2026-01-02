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
      var inpFile = row.querySelector('.imgFile');
      var inpCredit = row.querySelector('.imgCredit');
      var inpCaption = row.querySelector('.imgCaption');

      inpFile.value = img.file || '';
      inpCredit.value = img.credit || '';
      inpCaption.value = img.caption || '';

      // preview: prefer cache (local chosen file), else guess by file path in repo
      var cacheKey = contextKey + '|' + idx;
      var cached = previewCache[cacheKey];
      var src = cached || imgUrlFromFileField(img.file || '');
      if(src) imgTag.src = src;
      else imgTag.removeAttribute('src');

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
    if(currentView === 'prestart'){
      qs('editorTitle').textContent = 'Prestart';
      var node = qs('tplPrestart').content.cloneNode(true);
      body.appendChild(node);

      // ensure paths
      DATA.prestart = ensureObj(DATA.prestart);
      DATA.prestart.meetingPoint = ensureObj(DATA.prestart.meetingPoint);
      DATA.prestart.images = safeArr(DATA.prestart.images);

      // bind fields
      qs('pre_useLocationId').value = DATA.prestart.useLocationId || '';
      qs('pre_meetingLabel').value = DATA.prestart.meetingPoint.label || '';
      qs('pre_meetingLat').value = (DATA.prestart.meetingPoint.lat!=null) ? DATA.prestart.meetingPoint.lat : '';
      qs('pre_meetingLng').value = (DATA.prestart.meetingPoint.lng!=null) ? DATA.prestart.meetingPoint.lng : '';
      qs('pre_message').value = DATA.prestart.message || '';

      qs('pre_useLocationId').addEventListener('input', function(){ DATA.prestart.useLocationId = this.value.trim(); });
      qs('pre_meetingLabel').addEventListener('input', function(){ DATA.prestart.meetingPoint.label = this.value; });
      qs('pre_meetingLat').addEventListener('input', function(){ DATA.prestart.meetingPoint.lat = this.value===''?null:Number(this.value); });
      qs('pre_meetingLng').addEventListener('input', function(){ DATA.prestart.meetingPoint.lng = this.value===''?null:Number(this.value); });
      qs('pre_message').addEventListener('input', function(){ DATA.prestart.message = this.value; });

      // images editor
      var preImages = qs('pre_images');
      buildImagesEditor(preImages, DATA.prestart.images, 'prestart', function(newArr){
        DATA.prestart.images = newArr;
      });

      // add image file
      var addInp = qs('pre_addImageFile');
      addInp.addEventListener('change', function(){
        handleAddImageFile(addInp, DATA.prestart.images, 'prestart', function(newArr){
          DATA.prestart.images = newArr;
        });
      });

      return;
    }

    // location view
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

    loc.uitleg = ensureObj(loc.uitleg);
    loc.images = safeArr(loc.images);
    loc.vragen = safeArr(loc.vragen);

    qs('loc_id').value = loc.id || '';
    qs('loc_slot').value = loc.slot || '';
    qs('loc_naam').value = loc.naam || '';
    qs('loc_lat').value = (loc.lat!=null) ? loc.lat : '';
    qs('loc_lng').value = (loc.lng!=null) ? loc.lng : '';
    qs('loc_radius').value = (loc.radius!=null) ? loc.radius : '';
    qs('loc_routeHint').value = loc.routeHint || '';
    qs('loc_uitlegKort').value = loc.uitleg.kort || '';
    qs('loc_uitlegLang').value = loc.uitleg.uitgebreid || '';

    var mapA = qs('loc_mapLink');
    mapA.href = makeMapLink(loc.lat, loc.lng);

    qs('loc_slot').addEventListener('input', function(){ loc.slot = this.value.trim(); });
    qs('loc_naam').addEventListener('input', function(){ loc.naam = this.value; });
    qs('loc_lat').addEventListener('input', function(){
      loc.lat = this.value===''?null:Number(this.value);
      mapA.href = makeMapLink(loc.lat, loc.lng);
    });
    qs('loc_lng').addEventListener('input', function(){
      loc.lng = this.value===''?null:Number(this.value);
      mapA.href = makeMapLink(loc.lat, loc.lng);
    });
    qs('loc_radius').addEventListener('input', function(){ loc.radius = this.value===''?null:Number(this.value); });
    qs('loc_routeHint').addEventListener('input', function(){ loc.routeHint = this.value; });
    qs('loc_uitlegKort').addEventListener('input', function(){ loc.uitleg.kort = this.value; });
    qs('loc_uitlegLang').addEventListener('input', function(){ loc.uitleg.uitgebreid = this.value; });

    // images
    var locImages = qs('loc_images');
    buildImagesEditor(locImages, loc.images, 'loc:' + loc.id, function(newArr){
      loc.images = newArr;
    });

    var addInp2 = qs('loc_addImageFile');
    addInp2.addEventListener('change', function(){
      handleAddImageFile(addInp2, loc.images, 'loc:' + loc.id, function(newArr){
        loc.images = newArr;
      });
    });

    // vragen
    var vr = qs('loc_vragen');
    buildVragenEditor(vr, loc.vragen, function(newArr){
      // trim empty strings at end? liever niet automatisch; user is baas
      loc.vragen = newArr;
    });

    qs('loc_addVraag').addEventListener('click', function(){
      loc.vragen.push('');
      renderEditor();
    });
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
