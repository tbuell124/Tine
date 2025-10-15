import { registerRootComponent } from 'expo';
import { Text, View } from 'react-native';
function App() {
  return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Text>Tine ✅ Minimal</Text></View>;
}
registerRootComponent(App);
