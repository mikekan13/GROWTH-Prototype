# Manual Character Card Dragging Test

## Quick Test Procedure

1. **Navigate to your campaign** with characters:
   - Go to `http://localhost:3000/campaigns`
   - Click on your campaign with characters

2. **Open browser console** (F12)

3. **Run this diagnostic script**:

```javascript
// Diagnostic: Check if character cards are loaded
const cards = document.querySelectorAll('foreignObject');
console.log('Found', cards.length, 'character cards');

// Diagnostic: Check if positions are being saved
let saveCount = 0;
const originalFetch = window.fetch;
window.fetch = function(...args) {
  if (args[0].includes('/position')) {
    saveCount++;
    console.log('Position save #', saveCount, ':', args[1].body);
  }
  return originalFetch.apply(this, args);
};

console.log('Monitoring position saves... Try dragging a character card now.');
```

4. **Drag a character card**:
   - Should see smooth movement
   - Should see console logs showing position saves after 500ms
   - Should NOT warp or jump

5. **Test zoom + drag**:
   - Scroll to zoom out
   - Drag a card again
   - Should move smoothly without warping

6. **Test persistence**:
   - Drag a card to a new position
   - Wait 1 second
   - Refresh the page (F5)
   - Card should be in the same position

## Expected Console Output

```
Found 3 character cards
Monitoring position saves... Try dragging a character card now.
🎯 Node clxxx position updated to absolute world coordinates: (500, 300)
Position save # 1 : {"x":500,"y":300}
✅ Character clxxx position saved successfully
```

## Common Issues

### Issue: "Found 0 character cards"
**Fix**: You're not on a campaign with characters.  Go to Relations tab, add characters first.

### Issue: No position save logs
**Problem**: Debouncing or callback not working
**Check**: Look for errors in console about "onCharacterPositionChange"

### Issue: Card warps during zoom
**Problem**: Scale calculation issue
**Check**: Zoom level and card position in console

### Issue: Position doesn't persist after reload
**Problem**: Database not saving or not loading
**Check**: Network tab for POST `/api/characters/[id]/position` - should return 200

## Browser Console Debugging Commands

```javascript
// Check current zoom level
const svg = document.querySelector('svg');
const viewBox = svg.viewBox.baseVal;
console.log('ViewBox:', viewBox.width, viewBox.height);

// Check character positions in database
fetch('/api/campaigns/[your-campaign-id]/characters')
  .then(r => r.json())
  .then(data => {
    console.log('Characters from DB:');
    data.characters.forEach(c => {
      console.log(c.name, '- Position:', c.json?.position);
    });
  });

// Force save current positions
const cards = document.querySelectorAll('foreignObject');
cards.forEach((card, i) => {
  const box = card.getBoundingBox();
  console.log(`Card ${i}:`, {x: box.x, y: box.y});
});
```

## Report Issues

If you find issues, report with:
1. Screenshot of console logs
2. Description of behavior (e.g., "card jumps 200px left")
3. Zoom level when it happened
4. Browser (Chrome/Firefox/Safari)
