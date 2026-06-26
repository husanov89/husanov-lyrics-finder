const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const toLatin = (text) => {
  if (!text) return "";
  const map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'x','ц':'ts','ч':'ch','ш':'sh','щ':'sh','ъ':"'","ы":'i','ь':"'",'э':'e','ю':'yu','я':'ya','ғ':"g'",'қ':'q','ҳ':'h','ў':"o'",'ӯ':'u','ҷ':'j','ӣ':'i','ң':'ng','ү':'u','ұ':'u','ə':'a','ı':'i','А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'J','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'X','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sh','Ъ':"'",'Ы':'I','Ь':"'",'Э':'E','Ю':'Yu','Я':'Ya','Ғ':"G'",'Қ':'Q','Ҳ':'H','Ў':"O'",'Ӯ':'U','Ҷ':'J'};
  return text.split('').map(c => map[c] || c).join('');
};

const scrapeUzmatn = async (artist, song) => {
  try {
    const searchUrl = `https://uzmatn.net/search/${encodeURIComponent(artist + ' ' + song)}/`;
    const response = await axios.get(searchUrl, {headers: {'User-Agent': 'Mozilla/5.0'}, timeout: 5000});
    const $ = cheerio.load(response.data);
    const firstResult = $('a.publ_link').first();
    if (!firstResult.length) return null;
    const resultUrl = firstResult.attr('href');
    if (!resultUrl) return null;
    const lyricsResponse = await axios.get(resultUrl, {headers: {'User-Agent': 'Mozilla/5.0'}, timeout: 5000});
    const $lyrics = cheerio.load(lyricsResponse.data);
    const lyricsText = $lyrics('.text_publ').text().trim();
    if (!lyricsText) return null;
    return {source: 'uzmatn.net', url: resultUrl, lyrics: toLatin(lyricsText), lang: 'uzbek'};
  } catch (err) {
    return null;
  }
};

const scrapeLyricsus = async (artist, song) => {
  try {
    const searchUrl = `https://lyricsus.com/search?q=${encodeURIComponent(artist + ' ' + song)}`;
    const response = await axios.get(searchUrl, {headers: {'User-Agent': 'Mozilla/5.0'}, timeout: 5000});
    const $ = cheerio.load(response.data);
    const firstResult = $('a').filter((i, el) => $(el).attr('href')?.includes('/lyrics/')).first();
    if (!firstResult.length) return null;
    const resultUrl = firstResult.attr('href');
    if (!resultUrl || !resultUrl.startsWith('http')) return null;
    const lyricsResponse = await axios.get(resultUrl, {headers: {'User-Agent': 'Mozilla/5.0'}, timeout: 5000});
    const $lyrics = cheerio.load(lyricsResponse.data);
    const lyricsText = $lyrics('div[class*="lyrics"], div[class*="text"]').text().trim();
    if (!lyricsText) return null;
    return {source: 'lyricsus.com', url: resultUrl, lyrics: toLatin(lyricsText), lang: 'uzbek'};
  } catch (err) {
    return null;
  }
};

const searchGenius = async (artist, song) => {
  try {
    const searchUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(artist + ' ' + song)}`;
    const response = await axios.get(searchUrl, {headers: {'User-Agent': 'Mozilla/5.0'}, timeout: 5000});
    const results = response.data?.response?.sections?.[0]?.hits;
    if (!results || results.length === 0) return null;
    const songResult = results[0].result;
    if (!songResult.url) return null;
    const lyricsResponse = await axios.get(songResult.url, {headers: {'User-Agent': 'Mozilla/5.0'}, timeout: 5000});
    const $ = cheerio.load(lyricsResponse.data);
    const lyricsText = $('[data-lyrics-container="true"]').map((i, el) => $(el).text()).get().join('\n');
    if (!lyricsText) return null;
    return {source: 'genius.com', url: songResult.url, lyrics: lyricsText, lang: 'english'};
  } catch (err) {
    return null;
  }
};

const searchLyrics = async (artist, song) => {
  const results = await Promise.allSettled([scrapeUzmatn(artist, song), scrapeLyricsus(artist, song), searchGenius(artist, song)]);
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) return result.value;
  }
  return null;
};

app.get('/api/health', (req, res) => {
  res.json({status: 'OK', message: 'Husanov Lyrics Finder API is running'});
});

app.post('/api/search', async (req, res) => {
  try {
    const {artist, song} = req.body;
    if (!artist || !song) return res.status(400).json({error: "Artist va qo'shiq nomi kerak", success: false});
    const result = await searchLyrics(artist.trim(), song.trim());
    if (!result) return res.status(404).json({error: "Qo'shiq topilmadi", success: false});
    res.json({success: true, data: {artist, song, source: result.source, url: result.url, lyrics: result.lyrics, language: result.lang}});
  } catch (err) {
    res.status(500).json({error: 'Server xatolik: ' + err.message, success: false});
  }
});

app.get('/api/trending', (req, res) => {
  res.json({success: true, data: [{artist: "Shaxriyor", song: "Meni sev", flag: "🇺🇿"}, {artist: "Vahid Rustamiy", song: "Getme Yarim", flag: "🇹🇷"}, {artist: "G'aybulla Tursunov", song: "Quralay", flag: "🇺🇿"}, {artist: "Imron", song: "Jonim mani", flag: "🇺🇿"}, {artist: "Mashhur Muhammad", song: "Siqilma", flag: "🇺🇿"}, {artist: "Tarkan", song: "Kuzu Kuzune", flag: "🇹🇷"}]});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎵 Husanov Lyrics Finder API running on port ${PORT}`);
});

module.exports = app;
