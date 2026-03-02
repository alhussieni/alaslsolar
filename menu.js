// menu.js
let currentLang = "en";
let menuLinks = ["Home","About Us","Our Services","Our Projects","Contact Us"];
function toggleMenu(){
    const menu=document.getElementById("menu");
    const overlay=document.getElementById("overlay");
    menu.classList.toggle("show");
    overlay.style.opacity = menu.classList.contains("show") ? "1" : "0";
    overlay.style.visibility = menu.classList.contains("show") ? "visible" : "hidden";
}
document.querySelectorAll('.menu a').forEach(link=>{link.addEventListener('click',()=>{toggleMenu();});});
function toggleLang(){ currentLang=(currentLang==="en")?"ar":"en"; /* هنا ممكن تضيف translate كامل للروابط */ }
