;// I am awesome
(function () {
var f=null,J=function(){function n(b,k){this.id=b;this.c=k}function g(b,k){return C.hasOwnProperty.call(b,k)}function w(b){var k=x.apply(Math,b.map(function(b){return b.length})),a=[],m;for(m=0;m<k;++m)a.push(b.map(function(b){return b[m]}));return a}function s(b,k){function a(){!e&&d===b.length&&(e=!0,c[0]=p(c[0]),k.apply(f,c))}function m(k){b[k].call(f,function(){var b;for(b=0;b<arguments.length;++b)c[b]||(c[b]=[]),c[b][k]=arguments[b];++d;a()})}var c=[],d=0,e=!1,o;for(o=0;o<b.length;++o)m(o);a()}
function t(b){for(var b=F.exec(b),k={},a=14;a--;)k[u[a]]=b[a]||"";var m={};k.queryKey=m;k[u[12]].replace(I,function(b,k,a){k&&(m[k]=a)});return k}function v(b,k,a,m,c){return[b&&b+":",k&&"//"+k,a&&a,m&&"?"+m,c&&"#"+c].join("")}function r(b,k){if(/^\.\.?(\/|$)/.test(b))return k.cwd?k.cwd+"/"+b:b;var a=t(b),c=a.path;return!a.protocol&&!a.authority&&!/^[\/\\]/.test(c)?k.baseUrl?k.baseUrl+"/"+v(f,f,c,a.query,a.anchor):v(f,f,c,a.query,a.anchor):b}function l(b,a){return b.map(function(b){return r(b,a)})}
function c(b){var a;for(a=0;a<o.length;++a){var c=o[a],m=c.getResourceID(b);if(m!==f)return new n(m,c)}throw Error("No suitable plugin can handle module: "+b);}function d(b){function a(h){c[h]=d;m[h]=d;++d;e.push(h);g(b,h)&&b[h].forEach(function(b){g(c,b)?e.indexOf(b)>=0&&(m[h]=x(m[h],c[b])):(a(b),m[h]=x(m[h],m[b]))});if(m[h]===c[h]){var q=[],i;do i=e.pop(),q.push(i);while(i!==h);o.push(q)}}var c={},m={},d=0,e=[],o=[];Object.keys(b).forEach(function(b){g(c,b)||a(b)});return o}function a(){return d(G).filter(function(b){return b.length>
1})}function e(){a().forEach(function(b){b.length!==1&&(b.every(g.bind(f,z))||console.error("Circular dependency detected between the following modules:\n"+b.join("\n")))})}function i(b,a){if(g(z,b))throw Error("Cannot push to "+b+" which already has value "+z[b]);z[b]=a;if(g(A,b)){var c=A[b];delete A[b];c.map(function(b){b(f,a)})}}function j(b,a){g(z,b)?a(f,z[b]):(g(A,b)||(A[b]=[]),A[b].push(a),g(h,b)&&q.indexOf(b)<0&&(q.push(b),(0,h[b])()))}function D(b,a){if(g(h,b))throw Error("Resource "+b+" already announced");
g(A,b)?(q.push(b),a()):h[b]=a}function p(b){var a=!1;b&&b.map(function(b){b&&(a=!0)});if(a)return b}function B(b,a){var c=b.cwd;a.cwd&&(c+="/"+a.cwd);var d=b.baseUrl;a.baseUrl&&(d=a.baseUrl);return{cwd:c,baseUrl:d}}function y(b,a,c){b=b.map(function(b){return function(c){j(b.id,c);!g(z,b.id)&&!g(h,b.id)&&q.indexOf(b.id)<0&&!g(K,b.id)&&(K[b.id]=!0,b.c.fetchResource(b.id,a,function(b){if(b)return c(b)}))}});s(b,function(b,a){c(b,a||[])})}function E(b,a){var c=b.map(function(b){return function(a){b[1].c.extractModule(b[0],
b[2],a)}});s(c,function(b,c){a(b,c||[])})}var x=Math.min,C={},F=/^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,u="source,protocol,authority,userInfo,user,password,host,port,relative,path,directory,file,query,anchor".split(","),I=/(?:^|&)([^&=]*)=?([^&]*)/g,o=[],h={},q=[],z={},A={},K={},G={},H={definePlugin:function(b,a){typeof a==="function"&&(a=a(H));o.push(a)},parseUri:t,buildUri:v,push:i,pull:j,announce:D,
parseDefineArguments:function(b){var a=f,c=[],d=x(b.length-1,2),e=b[d],h=0;h<d&&typeof b[h]==="string"&&(a=b[h++]);h<d&&Array.isArray(b[h])&&(c=b[h++].slice());return{name:a,config:{},deps:c,factory:e}},parseRequireArguments:function(b){var a={},c=[],d=f,d=0;C.toString.call(b[d])==="[object Object]"&&(a=b[d++]);Array.isArray(b[d])&&(c=b[d++].slice());d=b[d];return{config:a,deps:c,factory:d}},createDefaultConfiguration:function(){return{baseUrl:"",cwd:"."}},joinConfigurations:B,handleDefine:function(b,
a,d){var a=B(a,b.config),h=r(b.name,a),o=c(h),q=b.factory,j=b.deps;D(o.id,function(){var b=l(j,a),h=b.map(c);h.forEach(function(b){var a=o.id,b=b.id;g(G,a)?G[a].push(b):G[a]=[b]});e();y(h,a,function(a,c){if(a)return d(a);E(w([c,h,b]),function(b,a){if(b)return d(b);var c=typeof q==="function"?q.apply(f,a):q;i(o.id,c);d(f)})})})},handleRequire:function(b,a,d){var a=B(a,b.config),h=b.factory,e=l(b.deps,a),o=e.map(c);y(o,a,function(b,a){if(b)return d(b);E(w([a,o,e]),function(b,a){if(b)return d(b);typeof h===
"function"&&h.apply(f,a);d(f)})})}};typeof this==="object"&&this?this.unrequire=H:typeof module==="object"&&module&&(module.exports=H);return H}();
(function(){try{window.document.createElement("script")}catch(n){return}J.definePlugin("browser",function(g){function n(a){if(a)throw a;}function s(a,c,d){for(var e;e=a.shift();){if(e.name===f)e.name=c;g.handleDefine(e,d,n)}}function t(a){if(!d)return!1;if(/loaded|complete/.test(l.readyState))return C||(console.warn("Scripts being loaded after document.onload; scripts may be loaded from out-of-date cache"),C=!0),console.warn("Script loaded from possibly out-of-date cache: "+a),!1;var c;try{var q=
new XMLHttpRequest;q.open("GET",a,!1);q.send(f);if(e.indexOf(q.status)<0)return!1;c=q.responseText;c+="\n\n//*/\n//@ sourceURL="+a}catch(i){return!1}try{}catch(g){return!1}Function(c)();return!0}function v(c,d){if(a&&t(c))d(f);else{var e=l.createElement("script");e.async=!0;x&&e.setAttribute("data-scriptName",c);e[j]=e[i]=function(){var b;if(!e.readyState||/loaded|complete/.test(e.readyState)){var a=e.parentNode;a&&a.removeChild(e);b=e[j]=e[i]=e[D]=f,e=b;d(f)}};e[D]=function(){d(Error("Failed to load script: "+
c))};cacheBust="?"+Math.random()+"_"+Math.random()+"_"+Math.random();e.src=c+cacheBust;l.head.appendChild(e)}}function r(){var a=g.parseDefineArguments(arguments);if(u===1&&a.name)g.handleDefine(a,"(global)",n);else{var c;if(x){a:{c=l.getElementsByTagName("script");var d,e;for(d=0;e=c[d];++d)if(e.readyState==="interactive"){c=e;break a}c=f}c=c.getAttribute("data-scriptName");c=y[c]}else c=E;c.push(a)}}var l=window.document,c=Object.prototype.toString.call(window.opera)==="[object Opera]",d=typeof navigator!==
"undefined"&&navigator&&/ AppleWebKit\//.test(navigator.userAgent),a=!1,e=[0,200,204,206,301,302,303,304,307],i="onreadystatechange",j="onload",D="onerror",p=g.buildUri,B=g.parseUri,y={},E=[],x=l.all&&!c,C=!1;r.f={};var F,u=0,I=g.createDefaultConfiguration();window.require=function(){var a=g.parseRequireArguments(arguments);g.handleRequire(a,I,n)};window.define=r;++u;return{getResourceID:function(a){var a=B(a),c=a.file.split(".").slice(1),d=a.path;if(c.length){if(c[c.length-1]!=="js")return f}else d+=
".js";a=p(a.protocol,a.authority,d,a.e);c=l.createElement("a");c.href=a;return c.href},fetchResource:function(a,c,d){var e=B(a),e=p(e.protocol,e.authority,e.directory).replace(/\/+$/,""),c=g.joinConfigurations(c,{});c.cwd=e;u===0&&(F=window.define);window.define=r;++u;x&&(y[a]=[]);v(a,function(e){--u;if(u<0)throw Error("Bad defineUses state; please report to unrequire developers!");u===0&&(window.define=F);if(e)return d(e);x?s(y[a],a,c):s(E,a,c);d()})},extractModule:function(a,c,d){d(f,a)}}})})();
J.definePlugin("Spaceport SWF",function(n){function g(c){return r(c.protocol,c.authority,c.path,c.query)}function w(c,d){return function e(i){i.target.removeEventListener(i.type,e);d(Error(c+i.text))}}function s(c,d,a,e,i){var a=g(a.uri),j=e.Loader,e=e.URLRequest;if(typeof j!=="function"||typeof e!=="function")i(Error("Spaceport not initialized"));else{var l=new j,p=l.contentLoaderInfo;p.addEventListener("complete",function y(){p.removeEventListener("complete",y);n.push(d,l);i(f)});p.addEventListener("ioError",
w("Failed to load "+c+" "+d+": ",i));l.load(new e(a))}}function t(c){var c=v(c),d=c.anchor.split("@"),a=d[0]||f,d=d[1]||f;if(!d){var e=c.file.split(".").slice(1);e[e.length-1]==="swf"&&(d="DisplayObject")}c.anchor="@"+d;return{d:a,type:d,uri:c}}var v=n.parseUri,r=n.buildUri,l={DisplayObject:{b:function(c,d,a,e){return s("DisplayObject",c,d,a,e)},a:function(c,d,a){d.d?a(f,c.contentLoaderInfo.applicationDomain.getDefinition(d.d)):a(f,c.content)}},Sound:{b:function(c,d,a,e){var d=g(d.uri),i=a.Sound,
a=a.URLRequest;if(typeof i!=="function"||typeof a!=="function")e(Error("Spaceport not initialized"));else{var j=new i;j.addEventListener("complete",function p(){j.removeEventListener("complete",p);n.push(c,j);e(f)});j.addEventListener("ioError",w("Failed to load Sound "+d+": ",e));j.load(new a(d))}},a:function(c,d,a){a(f,function(){return c})}},Bitmap:{b:function(c,d,a,e){return s("Bitmap",c,d,a,e)},a:function(c,d,a){var e=window.sp,i=c.content.bitmapData,c=e.Class.create(d.uri.path,e.Bitmap,{constructor:function(){var a=
new e.BitmapData(i.width,i.height,i.transparent);a.copyPixels(i,i.rect,new e.Point(0,0));e.Bitmap.call(this,a)}});a(f,c)}},ByteArray:{b:function(c,d,a,e){var d=g(d.uri),i=a.URLLoader,a=a.URLRequest;if(typeof i!=="function"||typeof a!=="function")e(Error("Spaceport not initialized"));else{var j=new i;j.addEventListener("complete",function p(){j.removeEventListener("complete",p);n.push(c,j);e(f)});j.addEventListener("ioError",w("Failed to load ByteArray "+c+": ",e));j.dataFormat="binary";j.load(new a(d))}},
a:function(c,d,a){var e=window.sp,d=e.Class.create(d.uri.path,e.ByteArray,{constructor:function(){e.ByteArray.call(this);this.writeBytes(c.data);this.position=0}});a(f,d)}}};return{getResourceID:function(c){c=t(c);return!Object.prototype.hasOwnProperty.call(l,c.type)?f:r(c.uri.protocol,c.uri.authority,c.uri.path,c.uri.query,c.uri.anchor)},fetchResource:function(c,d,a){if(d=(d=function(){return this}())&&d.sp){var e=t(c);l[e.type].b(c,e,d,a)}else a(Error("Spaceport not initialized; sp object not found on window"))},
extractModule:function(c,d,a){d=t(d);try{l[d.type].a(c,d,a)}catch(e){a(e)}}}});
(function(){typeof loadScript==="function"&&J.definePlugin("spaceport",function(n){function g(a){if(a)throw a;}function w(){var a=n.parseDefineArguments(arguments);l===1&&a.name?n.handleDefine(a,"(global)",g):v.push(a)}var s=n.parseUri,t=n.buildUri,v=[],r,l=0,c=n.createDefaultConfiguration(),d=function(){return this}();d.require=function(){var a=n.parseRequireArguments(arguments);n.handleRequire(a,c,g)};d.define=w;++l;return{getResourceID:function(a){var a=s(a),c=a.file.split(".").slice(1),d=a.path;
if(c.length){if(c[c.length-1]!=="js")return f}else d+=".js";return t(a.protocol,a.authority,d,a.e)},fetchResource:function(a,c,i){var j=s(a),j=t(j.protocol,j.authority,j.directory).replace(/\/+$/,""),c=n.joinConfigurations(c,{});c.cwd=j;l===0&&(r=d.define);d.define=w;++l;loadScript(a,function(){--l;if(l<0)throw Error("Bad defineUses state; please report to unrequire developers!");l===0&&(d.define=r);for(var j=c,p;p=v.shift();){if(p.name===f)p.name=a;n.handleDefine(p,j,g)}i(f)})},extractModule:function(a,
c,d){d(f,a)}}})})();
}());
